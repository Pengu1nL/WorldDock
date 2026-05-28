import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { NotificationsModule } from "../src/modules/notifications/notifications.module";
import {
  NOTIFICATIONS_REPOSITORY,
  type NotificationRecord,
  type NotificationsRepository,
  type SupportFeedbackRecord,
} from "../src/modules/notifications/notifications.service";

describe("notifications endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates idempotent notifications, marks read, and preserves support context", async () => {
    const auth = createInMemoryAuthRepository();
    const notifications = createInMemoryNotificationsRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    app = await createTestApp(auth, notifications);

    const first = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const second = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(first.body.notifications).toHaveLength(1);
    expect(second.body.notifications).toHaveLength(1);
    expect(second.body.unreadCount).toBe(1);

    const read = await request(app.getHttpServer())
      .post(`/v1/notifications/${first.body.notifications[0].id}/read`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    expect(read.body.notification.readAt).toEqual(expect.any(String));

    const feedback = await request(app.getHttpServer())
      .post("/v1/support/feedback")
      .set("authorization", "Bearer session_user_1")
      .send({ message: "希望支持更多导出格式。", context: { route: "/settings", worldId: "world_1" } })
      .expect(201);
    expect(feedback.body.feedback).toMatchObject({ message: "希望支持更多导出格式。", context: { route: "/settings", worldId: "world_1" } });
    expect(notifications.feedback[0].context).toEqual({ route: "/settings", worldId: "world_1" });

    const finalList = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(finalList.body.notifications.map((item: any) => item.type)).toContain("support_feedback_submitted");
  });
});

async function createTestApp(authRepository: AuthRepository, notificationsRepository: NotificationsRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [NotificationsModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(NOTIFICATIONS_REPOSITORY)
    .useValue(notificationsRepository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function addSession(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string) {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role: "user" });
  repository.sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 60_000) });
}

function createInMemoryAuthRepository() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const accessTokens = new Map<string, StoredAccessToken>();
  return {
    users,
    sessions,
    async findUserById(id: string) { return users.get(id) ?? null; },
    async findSessionByToken(token: string) { return sessions.get(token) ?? null; },
    async deleteSession(token: string) { sessions.delete(token); },
    async listAccessTokens() { return []; },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash() { return null; },
    async markAccessTokenUsed() {},
    async revokeAccessToken() { return null; },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions };
}

function createInMemoryNotificationsRepository() {
  const notifications: NotificationRecord[] = [];
  const feedback: SupportFeedbackRecord[] = [];
  return {
    notifications,
    feedback,
    async upsertNotification(input: Omit<NotificationRecord, "id" | "readAt" | "createdAt">) {
      const existing = input.dedupeKey
        ? notifications.find((notification) => notification.userId === input.userId && notification.dedupeKey === input.dedupeKey)
        : null;
      if (existing) {
        existing.title = input.title;
        existing.body = input.body;
        existing.type = input.type;
        return existing;
      }
      const notification = { id: `notification_${notifications.length + 1}`, readAt: null, createdAt: new Date(), ...input };
      notifications.unshift(notification);
      return notification;
    },
    async listNotifications(userId: string) {
      return notifications.filter((notification) => notification.userId === userId);
    },
    async markNotificationRead(userId: string, notificationId: string, readAt: Date) {
      const notification = notifications.find((item) => item.id === notificationId && item.userId === userId);
      if (!notification) return null;
      notification.readAt = readAt;
      return notification;
    },
    async createSupportFeedback(input: Omit<SupportFeedbackRecord, "id" | "status" | "createdAt">) {
      const record = { id: `feedback_${feedback.length + 1}`, status: "open" as const, createdAt: new Date(), ...input };
      feedback.push(record);
      return record;
    },
  } satisfies NotificationsRepository & { notifications: typeof notifications; feedback: typeof feedback };
}
