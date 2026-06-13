import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsService } from "../connections/connections.service";
import { ExportsService } from "../exports/exports.service";
import { WORLD_REPOSITORY } from "../worlds/world.repository";
import { WorldsController } from "../worlds/worlds.controller";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "../../../test/local-api-test-helpers";
import { PUSH_CLIENT_FETCH, PushClientService, type PushClientFetch } from "./push-client.service";

describe("PushClientService", () => {
  it("pushes selected assets to WorldHub with the configured bearer PAT", async () => {
    const worlds = await createWorldWithAssets();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const service = createPushClientService(worlds, async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        repository: { owner: "studio", slug: "memory-market" },
        release: {
          id: "rel_1",
          version: "1.0.0",
          url: "https://hub.example.test/studio/memory-market/releases/rel_1",
        },
      });
    });

    const result = await service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      note: "first push",
      selectedAssetIds: ["archive_1"],
    });

    expect(result.release.id).toBe("rel_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://hub.example.test/v1/repositories/studio/memory-market/releases");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer wdpat_full_token_1234567890",
      "content-type": "application/json",
    });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);

    const payload = JSON.parse(String(calls[0]?.init?.body));
    expect(payload.note).toBe("first push");
    expect(payload.snapshot.repository).toEqual({
      owner: "studio",
      slug: "memory-market",
      name: "回忆所",
    });
    expect(payload.snapshot.assets.map((asset: { id: string }) => asset.id)).toEqual(["archive_1"]);
    expect(payload.snapshot.package.assets.map((asset: { title: string }) => asset.title)).toEqual(["记忆交易法"]);
  });

  it("rejects when the Hub connection is not configured", async () => {
    const worlds = await createWorldWithAssets();
    const hubFetch = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "rel_1",
        version: "1.0.0",
        url: "https://hub.example.test/studio/memory-market/releases/rel_1",
      },
    }));
    const service = createPushClientService(worlds, hubFetch, { connection: null });

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["archive_1"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_FOUND" }),
    });
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it.each([
    { owner: "..", slug: "memory-market" },
    { owner: "studio", slug: "memory/market" },
    { owner: "studio", slug: "memory\\market" },
  ])("rejects unsafe repository path segments before calling fetch: %o", async (input) => {
    const worlds = await createWorldWithAssets();
    const hubFetch = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "rel_1",
        version: "1.0.0",
        url: "https://hub.example.test/studio/memory-market/releases/rel_1",
      },
    }));
    const service = createPushClientService(worlds, hubFetch);

    await expect(service.pushWorld({
      worldId: "world_1",
      ...input,
      selectedAssetIds: ["archive_1"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALIDATION_FAILED" }),
    });
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it("blocks secret findings by default without exposing secret excerpts", async () => {
    const worlds = await createWorldWithAssets({ archiveBody: "Keep .env beside DATABASE_URL=postgres://user:secret@localhost/world" });
    const hubFetch = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "rel_1",
        version: "1.0.0",
        url: "https://hub.example.test/studio/memory-market/releases/rel_1",
      },
    }));
    const service = createPushClientService(worlds, hubFetch);

    try {
      await service.pushWorld({
        worldId: "world_1",
        owner: "studio",
        slug: "memory-market",
        selectedAssetIds: ["archive_1"],
      });
      throw new Error("Expected secret findings to block push.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({ code: "SECRET_FINDINGS_BLOCKED" }),
      });
      const response = JSON.stringify((error as { response?: unknown }).response);
      expect(response).toContain("<redacted:");
      expect(response).not.toContain("postgres://");
      expect(response).not.toContain("secret@localhost");
    }
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it("allows push with secret findings when explicitly acknowledged", async () => {
    const worlds = await createWorldWithAssets({ archiveBody: "OPENAI_API_KEY=sk-allowlisted-secret" });
    const hubFetch = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "rel_1",
        version: "1.0.0",
        url: "https://hub.example.test/studio/memory-market/releases/rel_1",
      },
    }));
    const service = createPushClientService(worlds, hubFetch);

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["archive_1"],
      allowSecretFindings: true,
    })).resolves.toMatchObject({ release: { id: "rel_1" } });
    expect(hubFetch).toHaveBeenCalledOnce();
  });

  it("rejects missing selected assets before making a WorldHub request", async () => {
    const worlds = await createWorldWithAssets();
    const hubFetch = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "rel_1",
        version: "1.0.0",
        url: "https://hub.example.test/studio/memory-market/releases/rel_1",
      },
    }));
    const service = createPushClientService(worlds, hubFetch);

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["missing_asset"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALIDATION_FAILED" }),
    });
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid WorldHub push responses", async () => {
    const worlds = await createWorldWithAssets();
    const service = createPushClientService(worlds, async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: { id: "rel_1", version: "1.0.0" },
    }));

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["archive_1"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HUB_PUSH_INVALID_RESPONSE" }),
    });
  });

  it("rejects non-JSON WorldHub push responses", async () => {
    const worlds = await createWorldWithAssets();
    const service = createPushClientService(worlds, async () => new Response("not json", { status: 200 }));

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["archive_1"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HUB_PUSH_INVALID_RESPONSE" }),
    });
  });

  it("maps non-2xx WorldHub responses to HUB_PUSH_FAILED", async () => {
    const worlds = await createWorldWithAssets();
    const service = createPushClientService(worlds, async () => jsonResponse(
      { code: "UPSTREAM_ERROR" },
      { status: 503 },
    ));

    await expect(service.pushWorld({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      selectedAssetIds: ["archive_1"],
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "HUB_PUSH_FAILED",
        details: { status: 503 },
      }),
    });
  });

  it("maps fetch reject or abort to HUB_PUSH_FAILED without exposing the PAT", async () => {
    const worlds = await createWorldWithAssets();
    const service = createPushClientService(worlds, async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    try {
      await service.pushWorld({
        worldId: "world_1",
        owner: "studio",
        slug: "memory-market",
        selectedAssetIds: ["archive_1"],
      });
      throw new Error("Expected fetch abort to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: "HUB_PUSH_FAILED",
          details: { reason: "request_failed" },
        }),
      });
      expect(JSON.stringify((error as { response?: unknown }).response)).not.toContain("wdpat_full_token_1234567890");
    }
  });
});

describe("world push route", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("passes route input to PushClientService", async () => {
    const pushClient = {
      pushWorld: vi.fn(async () => ({
        repository: { owner: "studio", slug: "memory-market" },
        release: {
          id: "rel_1",
          version: "1.0.0",
          url: "https://hub.example.test/studio/memory-market/releases/rel_1",
        },
      })),
    };
    app = await createHttpTestApp({
      controllers: [WorldsController],
      providers: [
        { provide: WORLD_REPOSITORY, useValue: createInMemoryWorlds() },
        { provide: PushClientService, useValue: pushClient },
      ],
    });

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/world_1/push")
      .send({
        owner: "studio",
        slug: "memory-market",
        note: "publish",
        selectedAssetIds: ["archive_1"],
        allowSecretFindings: true,
      })
      .expect(201);

    expect(response.body.release.id).toBe("rel_1");
    expect(pushClient.pushWorld).toHaveBeenCalledWith({
      worldId: "world_1",
      owner: "studio",
      slug: "memory-market",
      note: "publish",
      selectedAssetIds: ["archive_1"],
      allowSecretFindings: true,
    });
  });

  it("returns VALIDATION_FAILED for invalid push request bodies", async () => {
    const pushClient = {
      pushWorld: vi.fn(),
    };
    app = await createHttpTestApp({
      controllers: [WorldsController],
      providers: [
        { provide: WORLD_REPOSITORY, useValue: createInMemoryWorlds() },
        { provide: PushClientService, useValue: pushClient },
      ],
    });

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/world_1/push")
      .send({
        owner: "studio",
        slug: "memory-market",
        selectedAssetIds: [],
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(pushClient.pushWorld).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for unsafe push request path segments", async () => {
    const pushClient = {
      pushWorld: vi.fn(),
    };
    app = await createHttpTestApp({
      controllers: [WorldsController],
      providers: [
        { provide: WORLD_REPOSITORY, useValue: createInMemoryWorlds() },
        { provide: PushClientService, useValue: pushClient },
      ],
    });

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/world_1/push")
      .send({
        owner: "..",
        slug: "memory\\market",
        selectedAssetIds: ["archive_1"],
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(pushClient.pushWorld).not.toHaveBeenCalled();
  });
});

async function createWorldWithAssets(options: { archiveBody?: string } = {}) {
  const worlds = createInMemoryWorlds();
  const world = await worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆", "城市"],
    mode: "local",
    maturity: 27,
  });
  await worlds.createArchiveEntry({
    worldId: world.id,
    title: "记忆交易法",
    category: "世界规则",
    summary: "所有交易都需要登记。",
    body: options.archiveBody ?? "未登记交易会触发城市信用审查。",
    relations: ["城市信用"],
    position: 0,
  });
  await worlds.createStorySeed({
    worldId: world.id,
    title: "继承的童年",
    hook: "主角买到一段陌生童年。",
    trigger: "一次非法交易",
    conflict: "这段记忆会改写他对家人的判断。",
    protagonists: "记忆修复师",
    questions: ["原主为何出售记忆？"],
    position: 1,
  });
  return worlds;
}

function createPushClientService(
  worlds: InMemoryWorlds,
  hubFetch: PushClientFetch,
  options: { connection?: Awaited<ReturnType<ConnectionsService["getInternalHubConnection"]>> | null } = {},
) {
  const defaultConnection = {
    id: "default",
    hubUrl: "https://hub.example.test",
    token: "wdpat_full_token_1234567890",
    createdAt: new Date("2026-06-12T00:00:00.000Z"),
    updatedAt: new Date("2026-06-12T00:00:00.000Z"),
  };
  const connection = options.connection === undefined ? defaultConnection : options.connection;
  const connections = {
    async getInternalHubConnection() {
      return connection;
    },
  } as ConnectionsService;
  return new PushClientService(
    connections,
    new ExportsService(worlds),
    hubFetch,
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}
