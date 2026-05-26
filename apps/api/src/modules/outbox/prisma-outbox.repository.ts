import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { OutboxRepository } from "./outbox.repository";

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createEvent(input: Parameters<OutboxRepository["createEvent"]>[0]) {
    return this.prisma.outboxEvent.create({ data: input as never });
  }

  async listPending() {
    return this.prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async markProcessed(id: string, processedAt: Date) {
    const updated = await this.prisma.outboxEvent.updateMany({ where: { id }, data: { processedAt } });
    if (updated.count === 0) return null;
    return this.prisma.outboxEvent.findUnique({ where: { id } });
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
