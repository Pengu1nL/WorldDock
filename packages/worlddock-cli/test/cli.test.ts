import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWorldDockCli } from "../src/main";

const env = {
  WORLD_DOCK_API_URL: "https://api.worlddock.test",
  WORLD_DOCK_TOKEN: "wdl_test_token",
};

describe("worlddock cli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("prints explicit auth guidance when token is missing", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["worlds", "list"], {
      env: { WORLD_DOCK_API_URL: "https://api.worlddock.test" },
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe("WORLD_DOCK_TOKEN is required.");
  });

  it("accepts login tokens without writing local files", async () => {
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
    expect(stdout[0]).toBe("WorldDock token detected. Export WORLD_DOCK_TOKEN for subsequent commands.");
    expect(await readdir(homeDir)).toEqual([]);
    expect(await readdir(configDir)).toEqual([]);
  });

  it("lists worlds with a bearer token", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ worlds: [{ id: "world_1", name: "回忆所" }] }));
    const stdout: string[] = [];

    await expect(runWorldDockCli(["worlds", "list"], { env, fetch: fetchMock as typeof fetch, stdout: (line) => stdout.push(line) })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer wdl_test_token" }),
    }));
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

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/world_1/export", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/import", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ package: worldPackage }),
    }));
    expect(JSON.parse(stdout[0])).toMatchObject({ format: "worlddock.world-package.v1" });
    expect(JSON.parse(stdout[1])).toEqual({ world: { id: "world_2", name: "Memory Market" } });
  });

  it("pulls repository packages without local deployment dependencies", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      package: {
        format: "worlddock.world-package.v1",
        exportedAt: "2026-05-27T12:00:00.000Z",
        world: { name: "Memory Market", type: "近未来", summary: "记忆交易。", tags: ["记忆"], maturity: 42 },
        assets: [{ kind: "setting", title: "记忆交易法", summary: "制度。", body: "正文。", payload: {} }],
        releases: [{ version: "v1.0.0", note: "初始发布", createdAt: "2026-05-27T12:00:00.000Z" }],
      },
    }));
    const stdout: string[] = [];

    await expect(runWorldDockCli(["repositories", "pull", "ren/memory-market"], { env, fetch: fetchMock as typeof fetch, stdout: (line) => stdout.push(line) })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/developer-access/repositories/ren/memory-market/pull", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer wdl_test_token" }),
    }));
    expect(JSON.parse(stdout[0]).assets[0]).toMatchObject({ kind: "setting", title: "记忆交易法" });
  });

  it.each(["memory-market", "ren/memory-market/typo"])("validates repository pull spec %s before calling the API", async (spec) => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["repositories", "pull", spec], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe("Repository must be formatted as <owner>/<slug>.");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
