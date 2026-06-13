import { BadGatewayException, Inject, Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { z } from "zod";

const HUB_CONNECTION_ID = "default";
const HUB_CONNECTION_TEST_TIMEOUT_MS = 5000;

export const HUB_CONNECTION_STORE = Symbol("HUB_CONNECTION_STORE");
export const HUB_CONNECTION_FETCH = Symbol("HUB_CONNECTION_FETCH");

export type HubConnectionRecord = {
  id: string;
  hubUrl: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveHubConnectionInput = {
  hubUrl: string;
  token: string;
};

export type HubConnectionStore = {
  get: () => Promise<HubConnectionRecord | null>;
  save: (input: SaveHubConnectionInput) => Promise<HubConnectionRecord>;
  delete: () => Promise<void>;
};

export type HubConnectionFetch = typeof fetch;

const hubUrlSchema = z.string().url().superRefine((value, context) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "Hub URL must use http or https.",
    });
  }
  if (parsed.search || parsed.hash) {
    context.addIssue({
      code: "custom",
      message: "Hub URL must not include query string or hash.",
    });
  }
  if (parsed.username || parsed.password) {
    context.addIssue({
      code: "custom",
      message: "Hub URL must not include credentials.",
    });
  }
});

const saveHubConnectionSchema = z.object({
  hubUrl: hubUrlSchema,
  token: z.string().min(20),
}).strict();

@Injectable()
export class PrismaHubConnectionStore implements HubConnectionStore, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async get() {
    return this.prisma.hubConnection.findUnique({
      where: { id: HUB_CONNECTION_ID },
    });
  }

  async save(input: SaveHubConnectionInput) {
    return this.prisma.hubConnection.upsert({
      where: { id: HUB_CONNECTION_ID },
      create: {
        id: HUB_CONNECTION_ID,
        hubUrl: input.hubUrl,
        token: input.token,
      },
      update: {
        hubUrl: input.hubUrl,
        token: input.token,
      },
    });
  }

  async delete() {
    await this.prisma.hubConnection.deleteMany({
      where: { id: HUB_CONNECTION_ID },
    });
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(HUB_CONNECTION_STORE) private readonly store: HubConnectionStore,
    @Inject(HUB_CONNECTION_FETCH) private readonly hubFetch: HubConnectionFetch,
  ) {}

  async getHubConnection() {
    const connection = await this.store.get();
    return { connection: connection ? toSafeConnection(connection) : null };
  }

  async getInternalHubConnection() {
    return this.store.get();
  }

  async saveHubConnection(body: unknown) {
    const input = saveHubConnectionSchema.parse(body);
    const connection = await this.store.save({
      hubUrl: normalizeHubUrl(input.hubUrl),
      token: input.token,
    });
    return { connection: toSafeConnection(connection) };
  }

  async deleteHubConnection() {
    await this.store.delete();
    return { connection: null };
  }

  async testHubConnection() {
    const connection = await this.store.get();
    if (!connection) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Hub connection is not configured.",
      });
    }

    let response: Response;
    try {
      response = await this.hubFetch(`${connection.hubUrl}/v1/account/me`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${connection.token}`,
        },
        signal: AbortSignal.timeout(HUB_CONNECTION_TEST_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException({
        code: "HUB_CONNECTION_FAILED",
        message: "WorldHub connection test failed.",
        details: { reason: "request_failed" },
      });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        code: "HUB_CONNECTION_FAILED",
        message: "WorldHub connection test failed.",
        details: { status: response.status },
      });
    }

    return { ok: true };
  }
}

function normalizeHubUrl(hubUrl: string) {
  return new URL(hubUrl).href.replace(/\/+$/, "");
}

function toSafeConnection(connection: HubConnectionRecord) {
  return {
    hubUrl: connection.hubUrl,
    tokenPrefix: connection.token.slice(0, 8),
  };
}
