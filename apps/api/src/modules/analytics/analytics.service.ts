import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  productEventNameSchema,
  type ProductEvent,
  type ProductEventInput,
  type ProductEventName,
} from "@worlddock/domain";

export const ANALYTICS_REPOSITORY = Symbol("ANALYTICS_REPOSITORY");

export type ProductEventRecord = {
  id: string;
  userId?: string | null;
  name: ProductEventName;
  context: Record<string, unknown>;
  anonymousId?: string | null;
  route?: string | null;
  userAgent?: string | null;
  occurredAt: Date;
  createdAt: Date;
};

export type ProductEventCreateInput = Omit<ProductEventRecord, "id" | "createdAt">;

export type AnalyticsRepository = {
  createEvent(input: ProductEventCreateInput): Promise<ProductEventRecord>;
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly repository: AnalyticsRepository) {}

  async record(input: ProductEventInput, userAgent?: string | null) {
    const event = await this.repository.createEvent({
      userId: input.userId ?? null,
      name: input.name,
      context: input.context,
      anonymousId: input.anonymousId ?? null,
      route: input.route ?? null,
      userAgent: userAgent ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    });
    return toProductEventResponse(event);
  }
}

@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createEvent(input: ProductEventCreateInput) {
    const event = await this.prisma.productAnalyticsEvent.create({
      data: {
        userId: input.userId ?? null,
        name: input.name,
        context: input.context as never,
        anonymousId: input.anonymousId ?? null,
        route: input.route ?? null,
        userAgent: input.userAgent ?? null,
        occurredAt: input.occurredAt,
      },
    });
    return mapProductEvent(event);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapProductEvent(record: {
  id: string;
  userId: string | null;
  name: string;
  context: unknown;
  anonymousId: string | null;
  route: string | null;
  userAgent: string | null;
  occurredAt: Date;
  createdAt: Date;
}): ProductEventRecord {
  return {
    ...record,
    name: productEventNameSchema.parse(record.name),
    context: normalizeContext(record.context),
  };
}

function normalizeContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toProductEventResponse(event: ProductEventRecord): ProductEvent {
  return {
    id: event.id,
    userId: event.userId ?? null,
    name: event.name,
    context: event.context,
    anonymousId: event.anonymousId ?? null,
    route: event.route ?? null,
    userAgent: event.userAgent ?? null,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}
