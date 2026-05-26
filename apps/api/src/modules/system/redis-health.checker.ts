import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import type { DependencyHealthChecker } from "./readiness.service";

@Injectable()
export class RedisHealthChecker implements DependencyHealthChecker, OnModuleDestroy {
  readonly name = "redis";
  private readonly redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  async check() {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }

    const pong = await this.redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
