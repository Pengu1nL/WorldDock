import { HttpException, HttpStatus, type INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import type { AuthSubject } from "../modules/auth/auth.service";

const defaultTrustedOrigins = ["http://localhost:3000"];
const rateLimitWindowMs = 60_000;
const rateLimitMax = Number(process.env.API_RATE_LIMIT_MAX ?? 120);

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitCounterStore = {
  increment(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
};

type SecurityRequest = {
  ip?: string;
  url?: string;
  raw?: { url?: string };
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  id?: string;
};

let defaultRateLimitStore: RateLimitCounterStore | null = null;

export function configureSecurity(app: INestApplication) {
  app.enableCors({
    origin: trustedOrigins(),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request: SecurityRequest, reply: any) => {
    const decision = await decideRateLimit(ipRateLimitKeys(request), defaultStore());
    addRateLimitHeaders(reply, decision);
    if (!decision.allowed) {
      return reply.code(429).send({
        code: "RATE_LIMITED",
        message: "Too many requests.",
        requestId: request.id,
      });
    }
  });

  fastify.addHook("onSend", async (_request: SecurityRequest, reply: any, payload: unknown) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });
}

export async function assertSubjectRateLimit(subject: AuthSubject, request: SecurityRequest) {
  const decision = await decideRateLimit(subjectRateLimitKeys(subject, request), defaultStore());
  if (!decision.allowed) {
    throw new HttpException({
      code: "RATE_LIMITED",
      message: "Too many requests.",
      resetAt: decision.resetAt,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
  return decision;
}

export async function decideRateLimit(
  keys: string[],
  store: RateLimitCounterStore,
  input: { max?: number; windowMs?: number; now?: number } = {},
): Promise<RateLimitDecision> {
  const now = input.now ?? Date.now();
  const max = input.max ?? rateLimitMax;
  const windowMs = input.windowMs ?? rateLimitWindowMs;
  const counters = await Promise.all(keys.map((key) => store.increment(key, windowMs, now)));
  const highestCount = counters.reduce((highest, counter) => Math.max(highest, counter.count), 0);
  const resetAt = counters.reduce((latest, counter) => Math.max(latest, counter.resetAt), now + windowMs);
  return {
    allowed: highestCount <= max,
    remaining: Math.max(0, max - highestCount),
    resetAt,
  };
}

export function createRedisRateLimitStore(redisUrl = process.env.API_RATE_LIMIT_REDIS_URL ?? process.env.REDIS_URL): RateLimitCounterStore {
  if (!redisUrl) return createMemoryRateLimitStore();
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  return {
    async increment(key, windowMs, now) {
      const namespacedKey = `worlddock:rate-limit:${key}`;
      const count = await redis.incr(namespacedKey);
      if (count === 1) await redis.pexpire(namespacedKey, windowMs);
      const ttl = await redis.pttl(namespacedKey);
      return { count, resetAt: now + (ttl > 0 ? ttl : windowMs) };
    },
  };
}

export function createMemoryRateLimitStore(): RateLimitCounterStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async increment(key, windowMs, now) {
      const bucket = buckets.get(key);
      const next = !bucket || bucket.resetAt <= now
        ? { count: 1, resetAt: now + windowMs }
        : { count: bucket.count + 1, resetAt: bucket.resetAt };
      buckets.set(key, next);
      return next;
    },
  };
}

export function subjectRateLimitKeys(subject: AuthSubject, request: SecurityRequest) {
  const family = routeFamily(request);
  const keys = [`user:${subject.user.id}:route:${family}`];
  if (subject.kind === "access-token") keys.push(`access-token:${subject.accessTokenId}:route:${family}`);
  return keys;
}

function ipRateLimitKeys(request: SecurityRequest) {
  return [`ip:${clientIp(request)}:route:${routeFamily(request)}`];
}

function defaultStore() {
  defaultRateLimitStore ??= createRedisRateLimitStore();
  return defaultRateLimitStore;
}

function routeFamily(request: SecurityRequest) {
  const path = (request.raw?.url ?? request.url ?? "/").split("?")[0] ?? "/";
  if (path.includes("/reports")) return "reports";
  if (path.includes("/agent-runs")) return "agent-runs";
  if (path.startsWith("/v1/community")) return "community";
  if (path.startsWith("/v1/billing")) return "billing";
  if (path.startsWith("/v1/repositories")) return "repositories";
  if (path.startsWith("/v1/worlds")) return "worlds";
  return `${request.method ?? "GET"}:${path.split("/").slice(0, 4).join("/")}`;
}

function clientIp(request: SecurityRequest) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (value?.split(",")[0]?.trim() || request.ip || "unknown").replace(/[^a-zA-Z0-9:._-]/g, "_");
}

function addRateLimitHeaders(reply: any, decision: RateLimitDecision) {
  reply.header("x-ratelimit-remaining", String(decision.remaining));
  reply.header("x-ratelimit-reset", String(decision.resetAt));
}

function trustedOrigins() {
  return (process.env.TRUSTED_ORIGINS ?? defaultTrustedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
