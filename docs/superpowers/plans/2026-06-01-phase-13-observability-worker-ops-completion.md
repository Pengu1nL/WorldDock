# Phase 13 可观测性、Worker 运维和生产发布闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 Alpha 发布前的 Worker 队列健康、异常告警、运维 runbook 和生产发布证据，让 Phase 13 可以用 API、Worker 测试和文档验收。

**Architecture:** 将 Worker 队列健康判定提升为共享 domain contract，Worker 侧负责 BullMQ 兼容快照读取和 release gate helper，API 侧通过 Nest service 读取真实 BullMQ 队列并暴露 `/v1/system/worker-health`。运维文档保留人工发布流程，但每个发布门禁都必须有 owner、evidence 和 command，且生产 ready 依赖 staging smoke 与健康队列快照。

**Tech Stack:** TypeScript、NestJS、BullMQ、Redis、Sentry、OpenTelemetry、Vitest、Supertest、pnpm。

---

## 现状与缺口

- `apps/worker/src/queue-dashboard.ts`、`apps/api/src/modules/system/worker-health.controller.ts`、`apps/worker/test/queue-dashboard.test.ts`、`apps/api/test/worker-health.integration-spec.ts` 和 `docs/operations/worker_alerts.md` 已存在，但更像早期草稿，不能直接视为 Phase 13 完成。
- API 当前从 `WORKER_QUEUE_HEALTH_JSON` 读取快照，默认返回静态健康队列，没有读取真实 BullMQ 队列，因此生产环境无法反映 Redis 队列状态。
- API controller 内重复实现 `classifyQueueHealth`，且默认队列名 `repository-search` 与 Worker 实际队列 `repository-search-indexing` 不一致。
- 现有测试覆盖健康响应，但没有锁定共享队列契约、真实 reader 注入、非健康队列的 observability event 以及 release gate 行为。
- `docs/operations/worker_alerts.md` 仍是英文，未按仓库默认文档语言收口为简体中文。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 仍把 Phase 13 标为未完成，执行完本计划并通过验收后需要补完成依据。

## 文件结构

- Create: `packages/domain/src/operations/queue-health.ts`
  定义 Worker 队列名、队列健康类型、zod schema、状态判定、快照聚合和生产发布 gate helper。
- Modify: `packages/domain/src/index.ts`
  导出 operations contract。
- Modify: `apps/worker/src/queue-dashboard.ts`
  改为复用 domain contract，并保留 BullMQ-compatible reader helper。
- Modify: `apps/worker/test/queue-dashboard.test.ts`
  覆盖 canonical 队列名、状态优先级、BullMQ reader 和 release gate。
- Modify: `apps/api/package.json`
  增加 `bullmq` 依赖，用 API service 读取真实队列。
- Create: `apps/api/src/modules/system/worker-health.service.ts`
  提供 `WORKER_QUEUE_READERS` 注入点、BullMQ reader factory、snapshot service 和 close 生命周期。
- Modify: `apps/api/src/modules/system/worker-health.controller.ts`
  删除本地重复判定和 env JSON 快照，改为调用 service，并对非健康队列发出 Sentry message。
- Modify: `apps/api/src/modules/system/system.module.ts`
  注册 `WorkerHealthService` 和默认 BullMQ readers provider。
- Modify: `apps/api/test/worker-health.integration-spec.ts`
  通过 provider override 注入 fake queue readers，覆盖 healthy、degraded、backlogged、paused 和 request id。
- Create: `apps/api/src/modules/system/worker-health.controller.spec.ts`
  单测 observability event helper，确保非健康队列会携带 queue tag。
- Modify: `docs/operations/worker_alerts.md`
  改写为简体中文 runbook，补告警条件、证据、处置步骤和发布 gate。
- Modify: `docs/operations/production_release_checklist.md`
  确认 Worker 队列健康、Sentry 告警可见、staging smoke 和发布后观察窗口都有 owner/evidence/command。
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  执行完成并通过验收后再把 Phase 13 标为完成。

## 提交身份检查

每个 commit step 前先运行：

```bash
git config user.name
git config user.email
```

如果输出包含真实姓名或个人邮箱，先在当前仓库设置通用身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

每个 commit step 后运行：

```bash
git log -1 --format=fuller
```

Expected: Author 和 Committer 都不包含真实姓名或个人邮箱。

### Task 1: 共享 Worker 队列健康契约

**Files:**
- Create: `packages/domain/src/operations/queue-health.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/worker/src/queue-dashboard.ts`
- Test: `apps/worker/test/queue-dashboard.test.ts`

- [ ] **Step 1: Write the failing Worker queue dashboard test**

Replace `apps/worker/test/queue-dashboard.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  WORKER_QUEUE_DESCRIPTORS,
  assertWorkerReleaseReady,
  classifyQueueHealth,
  createQueueHealthSnapshot,
  readQueueHealth,
  summarizeQueueHealth,
} from "../src/queue-dashboard";

describe("queue dashboard", () => {
  it("exposes canonical Alpha worker queues", () => {
    expect(WORKER_QUEUE_DESCRIPTORS).toEqual([
      { name: "repository-search-indexing", purpose: "Sync public repository documents into Meilisearch" },
      { name: "moderation-scan", purpose: "Scan reported or risky public repositories" },
      { name: "exports", purpose: "Prepare account data export packages" },
    ]);
  });

  it("classifies queue health by paused, failed, backlog, and healthy states", () => {
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: true })).toBe("paused");
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 1, delayed: 0, paused: false })).toBe("degraded");
    expect(classifyQueueHealth({ name: "search", waiting: 1001, active: 0, completed: 1, failed: 0, delayed: 0, paused: false })).toBe("backlogged");
    expect(classifyQueueHealth({ name: "search", waiting: 4, active: 1, completed: 8, failed: 0, delayed: 0, paused: false })).toBe("healthy");
  });

  it("reads BullMQ-compatible queue counts into a snapshot", async () => {
    const queue = {
      name: "repository-search-indexing",
      getJobCounts: vi.fn(async () => ({ waiting: 3, active: 1, completed: 9, failed: 0, delayed: 2 })),
      isPaused: vi.fn(async () => false),
    };

    await expect(readQueueHealth(queue)).resolves.toEqual({
      name: "repository-search-indexing",
      waiting: 3,
      active: 1,
      completed: 9,
      failed: 0,
      delayed: 2,
      paused: false,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith("waiting", "active", "completed", "failed", "delayed");
  });

  it("summarizes overall health using the most severe queue status", async () => {
    const generatedAt = new Date("2026-06-01T01:00:00.000Z");
    const snapshot = await createQueueHealthSnapshot([
      {
        name: "moderation-scan",
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 2, failed: 1, delayed: 0 }),
        isPaused: async () => false,
      },
      {
        name: "exports",
        getJobCounts: async () => ({ waiting: 5, active: 0, completed: 4, failed: 0, delayed: 0 }),
        isPaused: async () => true,
      },
    ], generatedAt);

    expect(snapshot).toMatchObject({
      status: "degraded",
      generatedAt: "2026-06-01T01:00:00.000Z",
      queues: [
        { name: "moderation-scan", status: "degraded" },
        { name: "exports", status: "paused" },
      ],
    });
  });

  it("blocks production release without staging smoke or healthy queues", () => {
    const generatedAt = new Date("2026-06-01T01:00:00.000Z");
    const degraded = summarizeQueueHealth([
      { name: "moderation-scan", waiting: 0, active: 0, completed: 2, failed: 1, delayed: 0, paused: false },
    ], generatedAt);

    expect(() => assertWorkerReleaseReady({ snapshot: degraded, stagingSmokeCompleted: false })).toThrow("Staging smoke must pass");
    expect(() => assertWorkerReleaseReady({ snapshot: degraded, stagingSmokeCompleted: true })).toThrow("Worker queues are not healthy: moderation-scan:degraded");

    const healthy = summarizeQueueHealth([
      { name: "repository-search-indexing", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: false },
    ], generatedAt);

    expect(() => assertWorkerReleaseReady({ snapshot: healthy, stagingSmokeCompleted: true })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the Worker test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
```

Expected: FAIL because `WORKER_QUEUE_DESCRIPTORS` is not exported from `apps/worker/src/queue-dashboard.ts`, and queue name expectations still do not use the canonical repository search queue.

- [ ] **Step 3: Add shared queue health contract**

Create `packages/domain/src/operations/queue-health.ts`:

```ts
import { z } from "zod";

export const WORKER_QUEUE_DESCRIPTORS = [
  { name: "repository-search-indexing", purpose: "Sync public repository documents into Meilisearch" },
  { name: "moderation-scan", purpose: "Scan reported or risky public repositories" },
  { name: "exports", purpose: "Prepare account data export packages" },
] as const;

export type WorkerQueueName = typeof WORKER_QUEUE_DESCRIPTORS[number]["name"];

export const queueHealthStatusSchema = z.enum(["healthy", "paused", "backlogged", "degraded"]);
export type QueueHealthStatus = z.infer<typeof queueHealthStatusSchema>;

export const queueHealthSchema = z.object({
  name: z.string().min(1),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  paused: z.boolean(),
});

export type QueueHealth = z.infer<typeof queueHealthSchema>;

export const queueHealthWithStatusSchema = queueHealthSchema.extend({
  status: queueHealthStatusSchema,
});

export type QueueHealthWithStatus = z.infer<typeof queueHealthWithStatusSchema>;

export const queueHealthSnapshotSchema = z.object({
  status: queueHealthStatusSchema,
  generatedAt: z.string().datetime(),
  queues: z.array(queueHealthWithStatusSchema),
});

export type QueueHealthSnapshot = z.infer<typeof queueHealthSnapshotSchema>;

export type QueueMetricReader = {
  name: string;
  getJobCounts(...statuses: Array<"waiting" | "active" | "completed" | "failed" | "delayed">): Promise<Partial<Record<"waiting" | "active" | "completed" | "failed" | "delayed", number>>>;
  isPaused(): Promise<boolean>;
};

const statusRank: Record<QueueHealthStatus, number> = {
  healthy: 0,
  paused: 1,
  backlogged: 2,
  degraded: 3,
};

export function classifyQueueHealth(queue: QueueHealth): QueueHealthStatus {
  if (queue.paused) return "paused";
  if (queue.failed > 0) return "degraded";
  if (queue.waiting > 1000) return "backlogged";
  return "healthy";
}

export async function readQueueHealth(queue: QueueMetricReader): Promise<QueueHealth> {
  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  return queueHealthSchema.parse({
    name: queue.name,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: await queue.isPaused(),
  });
}

export async function createQueueHealthSnapshot(queues: QueueMetricReader[], now = new Date()): Promise<QueueHealthSnapshot> {
  const health = await Promise.all(queues.map((queue) => readQueueHealth(queue)));
  return summarizeQueueHealth(health, now);
}

export function summarizeQueueHealth(queues: QueueHealth[], now = new Date()): QueueHealthSnapshot {
  const queuesWithStatus = queues.map((queue) => ({
    ...queueHealthSchema.parse(queue),
    status: classifyQueueHealth(queue),
  }));
  const status = queuesWithStatus.reduce<QueueHealthStatus>((current, queue) => {
    return statusRank[queue.status] > statusRank[current] ? queue.status : current;
  }, "healthy");

  return queueHealthSnapshotSchema.parse({
    status,
    generatedAt: now.toISOString(),
    queues: queuesWithStatus,
  });
}

export function assertWorkerReleaseReady(input: { snapshot: QueueHealthSnapshot; stagingSmokeCompleted: boolean }) {
  if (!input.stagingSmokeCompleted) {
    throw new Error("Staging smoke must pass before production release.");
  }

  const unhealthyQueues = input.snapshot.queues.filter((queue) => queue.status !== "healthy");
  if (unhealthyQueues.length > 0) {
    throw new Error(`Worker queues are not healthy: ${unhealthyQueues.map((queue) => `${queue.name}:${queue.status}`).join(", ")}`);
  }
}
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./assets";
export * from "./agent";
export * from "./analytics";
export * from "./api";
export * from "./billing";
export * from "./developer-access";
export * from "./moderation";
export * from "./notifications";
export * from "./operations/queue-health";
export * from "./repository";
export * from "./releases";
export * from "./storage";
export * from "./world";
export * from "./worlds/world-package";
```

Replace `apps/worker/src/queue-dashboard.ts` with:

```ts
export {
  WORKER_QUEUE_DESCRIPTORS,
  assertWorkerReleaseReady,
  classifyQueueHealth,
  createQueueHealthSnapshot,
  queueHealthSchema,
  queueHealthSnapshotSchema,
  queueHealthStatusSchema,
  queueHealthWithStatusSchema,
  readQueueHealth,
  summarizeQueueHealth,
  type QueueHealth,
  type QueueHealthSnapshot,
  type QueueHealthStatus,
  type QueueHealthWithStatus,
  type QueueMetricReader,
  type WorkerQueueName,
} from "@worlddock/domain";
```

- [ ] **Step 4: Run focused Worker/domain verification**

Run:

```bash
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
pnpm --filter @worlddock/worker lint
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run the identity check from this plan, then:

```bash
git add packages/domain/src/operations/queue-health.ts packages/domain/src/index.ts apps/worker/src/queue-dashboard.ts apps/worker/test/queue-dashboard.test.ts
git commit -m "feat: share worker queue health contract"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not contain the user's real name or personal email.

### Task 2: API Worker Health 端点读取真实队列

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/system/worker-health.service.ts`
- Modify: `apps/api/src/modules/system/worker-health.controller.ts`
- Modify: `apps/api/src/modules/system/system.module.ts`
- Test: `apps/api/test/worker-health.integration-spec.ts`

- [ ] **Step 1: Write the failing integration test**

Replace `apps/api/test/worker-health.integration-spec.ts` with:

```ts
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { QueueMetricReader } from "@worlddock/domain";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import {
  DEPENDENCY_HEALTH_CHECKERS,
  type DependencyHealthChecker,
} from "../src/modules/system/readiness.service";
import { WORKER_QUEUE_READERS } from "../src/modules/system/worker-health.service";

describe("worker health endpoint", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("exposes worker queue health from injected queue readers", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 2, active: 1, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .set("x-request-id", "req_worker_health")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "degraded",
      ready: false,
      requestId: "req_worker_health",
      queues: [
        { name: "repository-search-indexing", status: "healthy", waiting: 2 },
        { name: "moderation-scan", status: "degraded", failed: 1 },
        { name: "exports", status: "healthy" },
      ],
    });
    expect(response.body.generatedAt).toEqual(expect.any(String));
  });

  it("marks a backlog as not ready", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 1001, active: 0, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("backlogged");
    expect(response.body.ready).toBe(false);
    expect(response.body.queues[0]).toMatchObject({ name: "repository-search-indexing", status: "backlogged" });
  });

  it("returns ready when all queues are healthy", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 0, active: 0, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("healthy");
    expect(response.body.ready).toBe(true);
    expect(response.body.queues.map((queue: { name: string }) => queue.name)).toEqual([
      "repository-search-indexing",
      "moderation-scan",
      "exports",
    ]);
  });
});

async function createTestApp(queueReaders: QueueMetricReader[]) {
  const checkers: DependencyHealthChecker[] = [
    { name: "database", check: async () => undefined },
    { name: "redis", check: async () => undefined },
  ];

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DEPENDENCY_HEALTH_CHECKERS)
    .useValue(checkers)
    .overrideProvider(WORKER_QUEUE_READERS)
    .useValue(queueReaders)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function queueReader(name: string, counts: { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: boolean }): QueueMetricReader {
  return {
    name,
    getJobCounts: vi.fn(async () => ({
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
    })),
    isPaused: vi.fn(async () => counts.paused),
  };
}
```

- [ ] **Step 2: Run integration test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
```

Expected: FAIL because `WORKER_QUEUE_READERS` and `worker-health.service.ts` do not exist, and the current controller still reads `WORKER_QUEUE_HEALTH_JSON`.

- [ ] **Step 3: Add BullMQ dependency and WorkerHealthService**

Modify `apps/api/package.json` dependencies to include:

```json
"bullmq": "^5.77.3"
```

Create `apps/api/src/modules/system/worker-health.service.ts`:

```ts
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";
import {
  WORKER_QUEUE_DESCRIPTORS,
  createQueueHealthSnapshot,
  type QueueHealthSnapshot,
  type QueueMetricReader,
} from "@worlddock/domain";

export const WORKER_QUEUE_READERS = Symbol("WORKER_QUEUE_READERS");

export type ClosableQueueMetricReader = QueueMetricReader & {
  close?: () => Promise<void>;
};

@Injectable()
export class WorkerHealthService implements OnModuleDestroy {
  constructor(@Inject(WORKER_QUEUE_READERS) private readonly queueReaders: ClosableQueueMetricReader[]) {}

  async getSnapshot(now = new Date()): Promise<QueueHealthSnapshot> {
    return createQueueHealthSnapshot(this.queueReaders, now);
  }

  async onModuleDestroy() {
    await Promise.all(this.queueReaders.map((queue) => queue.close?.()));
  }
}

export function createBullMqWorkerQueueReaders(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"): ClosableQueueMetricReader[] {
  const connection = createRedisConnection(redisUrl);
  return WORKER_QUEUE_DESCRIPTORS.map((descriptor) => {
    const queue = new Queue(descriptor.name, { connection });
    return {
      name: descriptor.name,
      getJobCounts: (...statuses) => queue.getJobCounts(...statuses),
      isPaused: () => queue.isPaused(),
      close: () => queue.close(),
    };
  });
}

export function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
```

- [ ] **Step 4: Refactor controller and module**

Replace `apps/api/src/modules/system/worker-health.controller.ts` with:

```ts
import { Controller, Get, Req } from "@nestjs/common";
import type { QueueHealthWithStatus } from "@worlddock/domain";
import { captureMessage } from "../../common/observability";
import { getRequestId, type RequestWithRequestId } from "../../common/request-id";
import { WorkerHealthService } from "./worker-health.service";

@Controller("system")
export class WorkerHealthController {
  constructor(private readonly workerHealth: WorkerHealthService) {}

  @Get("worker-health")
  async getWorkerHealth(@Req() request: RequestWithRequestId) {
    const snapshot = await this.workerHealth.getSnapshot();
    captureUnhealthyQueueMessages(snapshot.queues);

    return {
      status: snapshot.status,
      ready: snapshot.status === "healthy",
      generatedAt: snapshot.generatedAt,
      timestamp: snapshot.generatedAt,
      queues: snapshot.queues,
      requestId: getRequestId(request),
    };
  }
}

export function captureUnhealthyQueueMessages(queues: QueueHealthWithStatus[]) {
  for (const queue of queues) {
    if (queue.status === "healthy") continue;

    captureMessage(`Worker queue ${queue.name} is ${queue.status}`, {
      tags: {
        component: "worker",
        queue: queue.name,
        queue_status: queue.status,
      },
      extra: {
        waiting: queue.waiting,
        active: queue.active,
        completed: queue.completed,
        failed: queue.failed,
        delayed: queue.delayed,
        paused: queue.paused,
      },
    });
  }
}
```

Modify `apps/api/src/modules/system/system.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DatabaseHealthChecker } from "./database-health.checker";
import { ReadinessService, DEPENDENCY_HEALTH_CHECKERS } from "./readiness.service";
import { RedisHealthChecker } from "./redis-health.checker";
import { SearchHealthChecker } from "./search-health.checker";
import { SystemController } from "./system.controller";
import { createBullMqWorkerQueueReaders, WorkerHealthService, WORKER_QUEUE_READERS } from "./worker-health.service";
import { WorkerHealthController } from "./worker-health.controller";

@Module({
  controllers: [SystemController, WorkerHealthController],
  providers: [
    DatabaseHealthChecker,
    RedisHealthChecker,
    SearchHealthChecker,
    WorkerHealthService,
    {
      provide: WORKER_QUEUE_READERS,
      useFactory: () => createBullMqWorkerQueueReaders(),
    },
    {
      provide: DEPENDENCY_HEALTH_CHECKERS,
      useFactory: (database: DatabaseHealthChecker, redis: RedisHealthChecker, search: SearchHealthChecker) => [database, redis, search],
      inject: [DatabaseHealthChecker, RedisHealthChecker, SearchHealthChecker],
    },
  ],
})
export class SystemModule {}
```

- [ ] **Step 5: Run focused API verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
pnpm --filter @worlddock/api lint
```

Expected: integration spec and API TypeScript lint pass.

- [ ] **Step 6: Commit**

Run the identity check from this plan, then:

```bash
git add apps/api/package.json apps/api/src/modules/system/worker-health.service.ts apps/api/src/modules/system/worker-health.controller.ts apps/api/src/modules/system/system.module.ts apps/api/test/worker-health.integration-spec.ts
git commit -m "feat: expose live worker queue health"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not contain the user's real name or personal email.

### Task 3: Observability event 覆盖和 Worker 告警辅助函数

**Files:**
- Modify: `apps/api/src/modules/system/worker-health.controller.ts`
- Create: `apps/api/src/modules/system/worker-health.controller.spec.ts`
- Modify: `apps/worker/src/observability.ts`
- Modify: `apps/worker/test/queue-dashboard.test.ts`

- [ ] **Step 1: Write failing API observability unit test**

Create `apps/api/src/modules/system/worker-health.controller.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueueHealthWithStatus } from "@worlddock/domain";

const captureMessage = vi.fn();

vi.mock("../../common/observability", () => ({
  captureMessage,
}));

describe("captureUnhealthyQueueMessages", () => {
  afterEach(() => {
    captureMessage.mockClear();
  });

  it("captures a Sentry message for every non-healthy worker queue", async () => {
    const { captureUnhealthyQueueMessages } = await import("./worker-health.controller");

    const queues: QueueHealthWithStatus[] = [
      { name: "repository-search-indexing", waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false, status: "healthy" },
      { name: "moderation-scan", waiting: 0, active: 0, completed: 3, failed: 1, delayed: 0, paused: false, status: "degraded" },
      { name: "exports", waiting: 1200, active: 0, completed: 3, failed: 0, delayed: 0, paused: false, status: "backlogged" },
    ];

    captureUnhealthyQueueMessages(queues);

    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage).toHaveBeenNthCalledWith(1, "Worker queue moderation-scan is degraded", {
      tags: {
        component: "worker",
        queue: "moderation-scan",
        queue_status: "degraded",
      },
      extra: {
        waiting: 0,
        active: 0,
        completed: 3,
        failed: 1,
        delayed: 0,
        paused: false,
      },
    });
    expect(captureMessage).toHaveBeenNthCalledWith(2, "Worker queue exports is backlogged", {
      tags: {
        component: "worker",
        queue: "exports",
        queue_status: "backlogged",
      },
      extra: {
        waiting: 1200,
        active: 0,
        completed: 3,
        failed: 0,
        delayed: 0,
        paused: false,
      },
    });
  });
});
```

- [ ] **Step 2: Run API unit test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/api test -- worker-health.controller.spec.ts
```

Expected: FAIL until `captureUnhealthyQueueMessages` is exported from the controller module with the exact behavior above.

- [ ] **Step 3: Add Worker queue-health capture assertion**

Append this test to `apps/worker/test/queue-dashboard.test.ts`:

```ts
import { captureWorkerQueueHealth } from "../src/observability";

describe("worker queue observability", () => {
  it("returns queue status from captureWorkerQueueHealth", () => {
    expect(captureWorkerQueueHealth({
      name: "moderation-scan",
      waiting: 0,
      active: 0,
      completed: 3,
      failed: 1,
      delayed: 0,
      paused: false,
    })).toBe("degraded");
  });
});
```

If the import block in `apps/worker/test/queue-dashboard.test.ts` already imports from `../src/observability`, merge the import into the existing import block instead of creating a duplicate.

- [ ] **Step 4: Run observability verification**

Run:

```bash
pnpm --filter @worlddock/api test -- worker-health.controller.spec.ts
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
```

Expected: both commands pass, proving API emits events for non-healthy queues and Worker queue health capture keeps returning the classified status.

- [ ] **Step 5: Commit**

Run the identity check from this plan, then:

```bash
git add apps/api/src/modules/system/worker-health.controller.ts apps/api/src/modules/system/worker-health.controller.spec.ts apps/worker/src/observability.ts apps/worker/test/queue-dashboard.test.ts
git commit -m "test: cover worker queue health alerts"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not contain the user's real name or personal email.

### Task 4: 运维 Runbook、发布 Checklist 和 Phase13 状态收口

**Files:**
- Modify: `docs/operations/worker_alerts.md`
- Modify: `docs/operations/production_release_checklist.md`
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: Run current documentation checks and confirm the gap**

Run:

```bash
rg -n "Worker Alerts|Alert Conditions|Required Evidence|Triage" docs/operations/worker_alerts.md
rg -n "Worker 队列健康快照|Worker 队列和失败告警可见|staging 冒烟|Owner:|Evidence:|Command:" docs/operations/production_release_checklist.md
rg -n "## Phase 13: 可观测性、Worker 运维和生产发布闭环|完成状态：已完成|worker-health.integration-spec.ts|queue-dashboard.test.ts" docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: first command still finds English headings, second command finds checklist fields, third command does not yet find Phase 13 completion evidence.

- [ ] **Step 2: Replace Worker alerts runbook with Chinese operations guidance**

Replace `docs/operations/worker_alerts.md` with:

````md
# Worker 队列告警 Runbook

WorldDock Cloud Alpha 把 Worker 队列健康视为生产发布门禁。发布负责人必须在 staging 冒烟前检查一次 `/v1/system/worker-health`，在生产切流前再次检查一次，并把响应里的 `requestId`、`generatedAt` 和队列状态记录到发布工单。

## 队列范围

- `repository-search-indexing`：将公开仓库 release 写入 Meilisearch。
- `moderation-scan`：处理重复举报和高风险公开仓库的审核扫描。
- `exports`：准备账户数据导出包。

## 告警条件

- `degraded`：任意队列存在 failed job。暂停发布，定位失败 job 的 payload、错误堆栈和最近部署差异。
- `backlogged`：任意队列 waiting job 大于 1000。暂停发布，检查 Redis 延迟、Worker 副本数和上游 outbox 入队速率。
- `paused`：任意队列处于暂停状态。确认是否为维护动作；如果不是，恢复队列前先记录操作者、时间和原因。

## 必需证据

- `/v1/system/worker-health` 响应，包含 `status`、`ready`、`generatedAt`、`requestId` 和每个队列的 counts。
- 非健康队列对应的 Sentry message 链接；事件 tag 必须包含 `component=worker`、`queue` 和 `queue_status`。
- Staging 冒烟证据，覆盖创作、Agent run、发布、搜索、Fork、举报、对象存储 signed URL、导入导出和通知。
- 发布工单中的处置记录，说明是否重试 failed job、是否扩容 Worker、是否恢复 paused queue。

## 处置流程

1. 记录当前 commit、部署环境、`/v1/system/worker-health` 响应和 Sentry event 链接。
2. 如果 `failed > 0`，先读取 failed job 的 error、attempts 和 payload，确认根因后再 retry。
3. 如果 `waiting > 1000`，检查 Redis health、Worker 副本数和 outbox 入队峰值；必要时先扩容 Worker 再继续发布。
4. 如果队列 `paused=true`，确认是否为计划内维护；无法确认时不得继续生产发布。
5. 所有队列恢复 `healthy` 后重新跑 staging 冒烟，并把新的 worker-health 响应追加到发布工单。
6. 只有 staging 冒烟通过且 `/v1/system/worker-health` 返回 `ready: true` 时，才能把生产发布标记为 ready。

## 常用命令

```bash
curl -fsS "$API_BASE_URL/v1/system/worker-health"
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
```
````

- [ ] **Step 3: Ensure release checklist fields are present**

Verify `docs/operations/production_release_checklist.md` contains these items exactly once:

```md
- [ ] staging 冒烟：创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL、导入导出、通知
  - Owner: release driver
  - Evidence: staging smoke ticket with screenshots or command output timestamp
  - Command: `pnpm --filter @worlddock/web test:e2e`
- [ ] Worker 队列健康快照为 healthy
  - Owner: worker owner
  - Evidence: `/v1/system/worker-health` response with request id and timestamp
  - Command: `curl -fsS "$API_BASE_URL/v1/system/worker-health"`
- [ ] Worker 队列和失败告警可见
  - Owner: worker owner
  - Evidence: Sentry project link and queue snapshot response
  - Command: `curl -fsS "$API_BASE_URL/v1/system/worker-health"`
- [ ] 发布后 30 分钟观察窗口有人值守
  - Owner: release driver
  - Evidence: on-call handoff note with owner and time window
  - Command: `date -u`
```

If any item is missing, add it in the production readiness section. If an item exists but lacks Owner/Evidence/Command, update it to match the block above.

- [ ] **Step 4: Update Phase 13 in incomplete-tasks after verification passes**

After Task 5 verification passes, replace the Phase 13 section in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` with:

```md
## Phase 13: 可观测性、Worker 运维和生产发布闭环

完成状态：已完成。

完成依据：

- `packages/domain/src/operations/queue-health.ts` 已定义 Worker 队列名、健康状态、快照 schema、状态判定和生产发布 gate helper。
- `apps/worker/src/queue-dashboard.ts` 已复用共享 contract，并保留 BullMQ-compatible queue reader、快照聚合和 release readiness helper。
- `apps/api/src/modules/system/worker-health.service.ts` 已通过 BullMQ 读取 `repository-search-indexing`、`moderation-scan` 和 `exports` 队列的 waiting、active、completed、failed、delayed 与 paused 状态。
- `apps/api/src/modules/system/worker-health.controller.ts` 已暴露 `/v1/system/worker-health`，返回 `status`、`ready`、`generatedAt`、`requestId` 和每个队列的健康状态。
- API 和 Worker observability 已对非健康队列发出带 `component=worker`、`queue` 和 `queue_status` tag 的 Sentry event。
- `docs/operations/worker_alerts.md` 已提供简体中文 Worker 告警 runbook，明确告警条件、必需证据、处置步骤和 release gate。
- `docs/operations/production_release_checklist.md` 已包含 Worker 队列健康、Sentry 告警、staging 冒烟和发布后观察窗口，并为每项记录 owner、evidence 和 command。
- `apps/api/test/worker-health.integration-spec.ts`、`apps/api/src/modules/system/worker-health.controller.spec.ts` 和 `apps/worker/test/queue-dashboard.test.ts` 覆盖 Phase 13 主路径。

验收证据：

- `pnpm --filter @worlddock/domain lint`：通过。
- `pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts`：通过。
- `pnpm --filter @worlddock/worker lint`：通过。
- `pnpm --filter @worlddock/api test -- worker-health.controller.spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/api lint`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 13 不接入真实托管队列面板，不建设管理后台，不把人工发布流程自动化成一键发布。
- Worker 队列健康 API 依赖 `REDIS_URL` 读取 BullMQ；本地和测试通过 provider override 注入 fake queue readers，避免依赖真实 Redis。
```

- [ ] **Step 5: Commit**

Run the identity check from this plan, then:

```bash
git add docs/operations/worker_alerts.md docs/operations/production_release_checklist.md docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: close worker operations runbooks"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not contain the user's real name or personal email.

### Task 5: End-to-end verification

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: Run Phase 13 focused verification**

Run:

```bash
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/api test -- worker-health.controller.spec.ts
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
pnpm --filter @worlddock/api lint
```

Expected: all commands pass.

- [ ] **Step 2: Run repository-level verification**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all commands pass.

- [ ] **Step 3: Verify no stale Phase 13 incomplete claims remain**

Run:

```bash
rg -n "Phase 13|queue-dashboard.ts|worker-health.controller.ts|worker_alerts.md|Release checklist 没有|API 未暴露 queue health|缺少 `worker-health.integration-spec.ts`|缺少 `queue-dashboard.test.ts`" docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: output shows Phase 13 completion status, completion evidence, verification commands and remaining non-goals only; it must not show old "未完成" bullets for Phase 13.

- [ ] **Step 4: Final commit**

Only if Task 4 did not already commit the updated incomplete-tasks file after final verification, run the identity check from this plan, then:

```bash
git add docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: mark phase 13 complete"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not contain the user's real name or personal email.

## Final Acceptance

Phase 13 can be marked complete only when all of these are true:

- `GET /v1/system/worker-health` reads live BullMQ queue counts through injectable readers and reports `ready: false` for degraded, backlogged or paused queues.
- API and Worker code share one queue-health contract, including canonical queue names and status precedence.
- Non-healthy queues emit observability messages with queue-specific tags when Sentry is configured.
- `docs/operations/worker_alerts.md` is in Simplified Chinese and describes alert conditions, required evidence and triage.
- `docs/operations/production_release_checklist.md` contains owner/evidence/command for Worker queue health, staging smoke, Sentry alert visibility and post-release observation.
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` records Phase 13 completion evidence and the verification commands above.
- Focused verification, repository lint, repository test and repository build all pass.
