import type { INestApplication } from "@nestjs/common";

const defaultTrustedOrigins = ["http://localhost:3000"];
const rateLimitWindowMs = 60_000;
const rateLimitMax = Number(process.env.API_RATE_LIMIT_MAX ?? 120);
const buckets = new Map<string, { count: number; resetAt: number }>();

export function configureSecurity(app: INestApplication) {
  app.enableCors({
    origin: trustedOrigins(),
    credentials: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request: any, reply: any) => {
    const key = request.ip ?? request.headers["x-forwarded-for"] ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    const next = !bucket || bucket.resetAt <= now
      ? { count: 1, resetAt: now + rateLimitWindowMs }
      : { count: bucket.count + 1, resetAt: bucket.resetAt };
    buckets.set(key, next);

    if (next.count > rateLimitMax) {
      reply.code(429).send({
        code: "RATE_LIMITED",
        message: "Too many requests.",
        requestId: request.id,
      });
    }
  });

  fastify.addHook("onSend", async (_request: any, reply: any, payload: unknown) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });
}

function trustedOrigins() {
  return (process.env.TRUSTED_ORIGINS ?? defaultTrustedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
