import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWorldDockCli } from "../src/main";

const env = {
  WORLD_DOCK_API_URL: "https://api.worlddock.test",
};

describe("worlddock cli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("prints the P4 login placeholder without writing local files", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stdout: string[] = [];
    const homeDir = await mkdtemp(join(tmpdir(), "worlddock-cli-home-"));
    const configDir = await mkdtemp(join(tmpdir(), "worlddock-cli-config-"));
    tempDirs.push(homeDir, configDir);

    await expect(runWorldDockCli(["login", "--token", "wdl_login_token"], {
      env: { HOME: homeDir, XDG_CONFIG_HOME: configDir },
      fetch: fetchMock as typeof fetch,
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stdout[0]).toBe("WorldDock Hub login is not configured yet. Run P4 to enable PAT connections.");
    expect(await readdir(homeDir)).toEqual([]);
    expect(await readdir(configDir)).toEqual([]);
  });

  it("lists worlds without auth headers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ worlds: [{ id: "world_1", name: "回忆所" }] }));
    const stdout: string[] = [];

    await expect(runWorldDockCli(["worlds", "list"], { env, fetch: fetchMock as typeof fetch, stdout: (line) => stdout.push(line) })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds", { method: "GET" });
    expect(JSON.parse(stdout[0])).toEqual({ worlds: [{ id: "world_1", name: "回忆所" }] });
  });

  it("exports and imports world packages", async () => {
    const worldPackage = {
      format: "worlddock.world-package.v1",
      exportedAt: "2026-05-27T12:00:00.000Z",
      world: { name: "Memory Market", type: "近未来", summary: "记忆交易。", tags: ["记忆"], maturity: 42 },
      assets: [],
      releases: [],
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/worlds/world_1/export")) return jsonResponse({ export: { id: "export_1" } });
      if (String(url).endsWith("/v1/exports/export_1")) return jsonResponse({ package: worldPackage });
      if (String(url).endsWith("/v1/worlds/import")) return jsonResponse({ world: { id: "world_2", name: "Memory Market" } });
      return jsonResponse({}, 404);
    });
    const stdout: string[] = [];
    const dir = await mkdtemp(join(tmpdir(), "worlddock-cli-"));
    tempDirs.push(dir);
    const packagePath = join(dir, "memory-market.worlddock.json");
    await writeFile(packagePath, JSON.stringify(worldPackage), "utf8");

    await expect(runWorldDockCli(["worlds", "export", "world_1"], { env, fetch: fetchMock as typeof fetch, stdout: (line) => stdout.push(line) })).resolves.toBe(0);
    await expect(runWorldDockCli(["worlds", "import", packagePath], { env, fetch: fetchMock as typeof fetch, stdout: (line) => stdout.push(line) })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/world_1/export", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/import", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: worldPackage }),
    }));
    expect(JSON.parse(stdout[0])).toMatchObject({ format: "worlddock.world-package.v1" });
    expect(JSON.parse(stdout[1])).toEqual({ world: { id: "world_2", name: "Memory Market" } });
  });

  it("pulls a world through the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      world: { id: "world_2", name: "Memory Market" },
      remap: { assets: [{ upstreamId: "hub_archive_1", localId: "archive_2" }], counts: { assets: 1, archive: 1, seeds: 0, conflicts: 0 } },
    }));
    const stdout: string[] = [];

    await expect(runWorldDockCli(["worlds", "pull", "studio", "memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/pull", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: "studio", slug: "memory-market" }),
    }));
    expect(JSON.parse(stdout[0])).toEqual({
      world: { id: "world_2", name: "Memory Market" },
      remap: { assets: [{ upstreamId: "hub_archive_1", localId: "archive_2" }], counts: { assets: 1, archive: 1, seeds: 0, conflicts: 0 } },
    });
  });

  it("treats cloud pull as unknown usage", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["repositories", "pull", "ren/memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe("Usage: worlddock login | worlds list | worlds export <worldId> | worlds import <file> | worlds pull <owner> <slug>");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
