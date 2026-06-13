import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionsController } from "../src/modules/connections/connections.controller";
import {
  ConnectionsService,
  HUB_CONNECTION_FETCH,
  HUB_CONNECTION_STORE,
  type HubConnectionRecord,
  type HubConnectionStore,
} from "../src/modules/connections/connections.service";
import { createHttpTestApp } from "./local-api-test-helpers";

describe("connections local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  it("saves a hub connection, reads only a token prefix, and deletes it", async () => {
    const store = createInMemoryHubConnectionStore();
    app = await createConnectionsApp(store);
    const fullToken = "wdpat_1234567890abcdef";

    const saved = await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "https://hub.example.com/", token: fullToken })
      .expect(200);
    expect(saved.body.connection).toEqual({
      hubUrl: "https://hub.example.com",
      tokenPrefix: "wdpat_12",
    });
    expect(JSON.stringify(saved.body)).not.toContain(fullToken);
    expect(await store.get()).toMatchObject({
      hubUrl: "https://hub.example.com",
      token: fullToken,
    });

    const fetched = await request(app.getHttpServer())
      .get("/v1/connections/hub")
      .expect(200);
    expect(fetched.body.connection).toEqual({
      hubUrl: "https://hub.example.com",
      tokenPrefix: "wdpat_12",
    });
    expect(JSON.stringify(fetched.body)).not.toContain(fullToken);

    await request(app.getHttpServer())
      .delete("/v1/connections/hub")
      .expect(200)
      .expect({ connection: null });

    await request(app.getHttpServer())
      .get("/v1/connections/hub")
      .expect(200)
      .expect({ connection: null });
  });

  it("rejects invalid connection settings", async () => {
    const store = createInMemoryHubConnectionStore();
    app = await createConnectionsApp(store);

    const response = await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "not-a-url", token: "short" })
      .expect(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
    });
    expect(await store.get()).toBeNull();
  });

  it("rejects hub URLs with unsupported protocols, query strings, or hashes", async () => {
    const store = createInMemoryHubConnectionStore();
    app = await createConnectionsApp(store);

    for (const hubUrl of [
      "ftp://hub.example.com",
      "https://hub.example.com?tenant=worlddock",
      "https://hub.example.com#token",
      "https://wdpat_secret1234567890@hub.example.com",
    ]) {
      const response = await request(app.getHttpServer())
        .put("/v1/connections/hub")
        .send({ hubUrl, token: "wdpat_1234567890abcdef" })
        .expect(400);

      expect(response.body).toMatchObject({
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
      });
      expect(await store.get()).toBeNull();
    }
  });

  it("tests the stored hub connection against the WorldHub account endpoint", async () => {
    const store = createInMemoryHubConnectionStore();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ account: { id: "acct_1" } }), { status: 200 }));
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    app = await createConnectionsApp(store, fetchMock);
    const fullToken = "wdpat_abcdef1234567890";

    await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "https://hub.example.com/", token: fullToken })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/v1/connections/hub/test")
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock).toHaveBeenCalledWith("https://hub.example.com/v1/account/me", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${fullToken}`,
      },
      signal: timeoutSignal,
    });
  });

  it("returns 404 when testing without a configured hub connection", async () => {
    const store = createInMemoryHubConnectionStore();
    app = await createConnectionsApp(store);

    const response = await request(app.getHttpServer())
      .post("/v1/connections/hub/test")
      .expect(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Hub connection is not configured.",
    });
  });

  it("reports fetch rejections without exposing the stored token", async () => {
    const store = createInMemoryHubConnectionStore();
    const fetchMock = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    app = await createConnectionsApp(store, fetchMock);
    const fullToken = "wdpat_rejected1234567";

    await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "https://hub.example.com/", token: fullToken })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/v1/connections/hub/test")
      .expect(502);

    expect(response.body).toMatchObject({
      code: "HUB_CONNECTION_FAILED",
      message: "WorldHub connection test failed.",
      details: { reason: "request_failed" },
    });
    expect(JSON.stringify(response.body)).not.toContain(fullToken);
  });

  it("reports aborted connection tests without exposing the stored token", async () => {
    const store = createInMemoryHubConnectionStore();
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    app = await createConnectionsApp(store, fetchMock);
    const fullToken = "wdpat_aborted12345678";

    await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "https://hub.example.com/", token: fullToken })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/v1/connections/hub/test")
      .expect(502);

    expect(response.body).toMatchObject({
      code: "HUB_CONNECTION_FAILED",
      message: "WorldHub connection test failed.",
      details: { reason: "request_failed" },
    });
    expect(JSON.stringify(response.body)).not.toContain(fullToken);
  });

  it("reports connection test failures without exposing the stored token", async () => {
    const store = createInMemoryHubConnectionStore();
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    app = await createConnectionsApp(store, fetchMock);
    const fullToken = "wdpat_failed1234567890";

    await request(app.getHttpServer())
      .put("/v1/connections/hub")
      .send({ hubUrl: "https://hub.example.com/", token: fullToken })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/v1/connections/hub/test")
      .expect(502);

    expect(response.body).toMatchObject({
      code: "HUB_CONNECTION_FAILED",
      message: "WorldHub connection test failed.",
      details: { status: 401 },
    });
    expect(JSON.stringify(response.body)).not.toContain(fullToken);
  });
});

async function createConnectionsApp(store: HubConnectionStore, fetchMock?: typeof fetch) {
  return createHttpTestApp({
    controllers: [ConnectionsController],
    providers: [
      ConnectionsService,
      { provide: HUB_CONNECTION_STORE, useValue: store },
      { provide: HUB_CONNECTION_FETCH, useValue: fetchMock ?? vi.fn(async () => new Response("{}", { status: 200 })) },
    ],
  });
}

function createInMemoryHubConnectionStore(): HubConnectionStore {
  let connection: HubConnectionRecord | null = null;

  return {
    async get() {
      return connection;
    },
    async save(input) {
      const timestamp = new Date();
      connection = {
        id: "default",
        hubUrl: input.hubUrl,
        token: input.token,
        createdAt: connection?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      return connection;
    },
    async delete() {
      connection = null;
    },
  };
}
