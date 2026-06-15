import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageService } from "./local-storage.service";

describe("LocalStorageService", () => {
  let previousDataDir: string | undefined;
  let dataDir: string;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-local-storage-"));
    process.env.WORLD_DOCK_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (previousDataDir === undefined) {
      delete process.env.WORLD_DOCK_DATA_DIR;
    } else {
      process.env.WORLD_DOCK_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  it("saves and reads objects under the configured data directory", async () => {
    const service = new LocalStorageService();
    const body = new TextEncoder().encode("hello worlddock");

    const saved = await service.saveObject({
      key: "worlds/world_1/export.json",
      contentType: "application/json",
      body,
    });

    expect(saved.key).toBe("worlds/world_1/export.json");
    expect(saved.filePath).toBe(join(dataDir, "worlds/world_1/export.json"));
    expect(saved.sizeBytes).toBe(body.byteLength);
    await expect(stat(saved.filePath)).resolves.toMatchObject({ size: body.byteLength });

    await expect(service.readObject("worlds/world_1/export.json")).resolves.toEqual({
      contentType: "application/json",
      body,
    });
  });

  it("rejects unsafe object keys", async () => {
    const service = new LocalStorageService();

    await expect(service.saveObject({
      key: "../outside.txt",
      body: new Uint8Array([1]),
    })).rejects.toThrow(/Invalid local storage key/);
    await expect(service.readObject("/absolute.txt")).rejects.toThrow(/Invalid local storage key/);
  });

  it("keeps object metadata isolated from colliding object keys", async () => {
    const service = new LocalStorageService();

    await service.saveObject({
      key: "foo",
      contentType: "text/plain",
      body: new TextEncoder().encode("plain"),
    });
    await service.saveObject({
      key: "foo.meta.json",
      contentType: "application/json",
      body: new TextEncoder().encode("{\"ok\":true}"),
    });
    await service.deleteObject("foo.meta.json");

    await expect(service.readObject("foo")).resolves.toEqual({
      contentType: "text/plain",
      body: new TextEncoder().encode("plain"),
    });
  });

  it("saves objects only when the current body matches the expected body", async () => {
    const service = new LocalStorageService();
    const original = new TextEncoder().encode("original");
    const replacement = new TextEncoder().encode("replacement");

    await service.saveObject({
      key: "tmp/cas.txt",
      contentType: "text/plain",
      body: original,
    });

    await expect(service.saveObjectIfCurrentBodyEquals({
      key: "tmp/cas.txt",
      expectedBody: original,
      contentType: "text/markdown",
      body: replacement,
    })).resolves.toBe(true);

    await expect(service.readObject("tmp/cas.txt")).resolves.toEqual({
      contentType: "text/markdown",
      body: replacement,
    });
  });

  it("does not save objects when the current body differs from the expected body", async () => {
    const service = new LocalStorageService();
    const original = new TextEncoder().encode("original");
    const replacement = new TextEncoder().encode("replacement");

    await service.saveObject({
      key: "tmp/cas-miss.txt",
      contentType: "text/plain",
      body: original,
    });

    await expect(service.saveObjectIfCurrentBodyEquals({
      key: "tmp/cas-miss.txt",
      expectedBody: new TextEncoder().encode("stale"),
      contentType: "text/markdown",
      body: replacement,
    })).resolves.toBe(false);

    await expect(service.readObject("tmp/cas-miss.txt")).resolves.toEqual({
      contentType: "text/plain",
      body: original,
    });
  });

  it("deletes objects and ignores missing keys", async () => {
    const service = new LocalStorageService();
    await service.saveObject({ key: "tmp/file.txt", body: new TextEncoder().encode("temporary") });

    await service.deleteObject("tmp/file.txt");
    await expect(stat(join(dataDir, "tmp/file.txt"))).rejects.toThrow();
    await expect(service.deleteObject("tmp/missing.txt")).resolves.toBeUndefined();
  });
});
