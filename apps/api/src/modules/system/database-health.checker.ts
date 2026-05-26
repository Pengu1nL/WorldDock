import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { DependencyHealthChecker } from "./readiness.service";

@Injectable()
export class DatabaseHealthChecker implements DependencyHealthChecker, OnModuleDestroy {
  readonly name = "database";
  private readonly prisma: PrismaClient = createPrismaClient();

  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
