import { Inject, Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { notificationTypeSchema, type NotificationType } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type SupportFeedbackRecord = {
  id: string;
  userId: string;
  message: string;
  context: unknown;
  status: "open" | "closed";
  createdAt: Date;
};

export type NotificationsRepository = {
  upsertNotification(input: Omit<NotificationRecord, "id" | "readAt" | "createdAt">): Promise<NotificationRecord>;
  listNotifications(userId: string): Promise<NotificationRecord[]>;
  markNotificationRead(userId: string, notificationId: string, readAt: Date): Promise<NotificationRecord | null>;
  createSupportFeedback(input: Omit<SupportFeedbackRecord, "id" | "status" | "createdAt">): Promise<SupportFeedbackRecord>;
};

@Injectable()
export class NotificationsService {
  constructor(@Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository) {}

  async list(subject: AuthSubject) {
    await this.ensureWelcome(subject);
    const notifications = await this.repository.listNotifications(subject.user.id);
    return {
      notifications: notifications.map(toNotificationResponse),
      unreadCount: notifications.filter((notification) => !notification.readAt).length,
    };
  }

  async markRead(subject: AuthSubject, notificationId: string) {
    const notification = await this.repository.markNotificationRead(subject.user.id, notificationId, new Date());
    if (!notification) throw new NotFoundException({ code: "NOT_FOUND", message: "Notification not found." });
    return toNotificationResponse(notification);
  }

  async submitFeedback(subject: AuthSubject, input: { message: string; context: unknown }) {
    const feedback = await this.repository.createSupportFeedback({
      userId: subject.user.id,
      message: input.message,
      context: input.context,
    });
    const notification = await this.createNotification(subject.user.id, {
      type: "support_feedback_submitted",
      title: "反馈已收到",
      body: "Alpha 团队会在产品节奏中处理这条反馈。",
      dedupeKey: `support-feedback:${feedback.id}`,
    });
    return { feedback: toFeedbackResponse(feedback), notification: toNotificationResponse(notification) };
  }

  async createNotification(userId: string, input: {
    type: NotificationType;
    title: string;
    body: string;
    dedupeKey?: string;
  }) {
    return this.repository.upsertNotification({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey ?? `${input.type}:${userId}`,
    });
  }

  private async ensureWelcome(subject: AuthSubject) {
    await this.createNotification(subject.user.id, {
      type: "welcome",
      title: "欢迎来到 WorldDock Alpha",
      body: "你的站内通知会显示发布、余额、反馈和协作事件。",
      dedupeKey: `welcome:${subject.user.id}`,
    });
  }
}

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async upsertNotification(input: Parameters<NotificationsRepository["upsertNotification"]>[0]) {
    const notification = input.dedupeKey
      ? await this.prisma.notification.upsert({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          create: input,
          update: { title: input.title, body: input.body, type: input.type },
        })
      : await this.prisma.notification.create({ data: input });
    return mapNotification(notification);
  }

  async listNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return notifications.map(mapNotification);
  }

  async markNotificationRead(userId: string, notificationId: string, readAt: Date) {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt },
    });
    if (updated.count === 0) return null;
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    return notification ? mapNotification(notification) : null;
  }

  async createSupportFeedback(input: Parameters<NotificationsRepository["createSupportFeedback"]>[0]) {
    const feedback = await this.prisma.supportFeedback.create({ data: input as never });
    return mapFeedback(feedback);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapNotification(record: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    ...record,
    type: notificationTypeSchema.parse(record.type),
  };
}

function mapFeedback(record: {
  id: string;
  userId: string;
  message: string;
  context: unknown;
  status: string;
  createdAt: Date;
}): SupportFeedbackRecord {
  return {
    ...record,
    status: record.status === "closed" ? "closed" : "open",
  };
}

function toNotificationResponse(notification: NotificationRecord) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function toFeedbackResponse(feedback: SupportFeedbackRecord) {
  return {
    ...feedback,
    createdAt: feedback.createdAt.toISOString(),
  };
}
