import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWorldDockCli } from "../src/main";

const env = {
  WORLD_DOCK_API_URL: "https://api.worlddock.test",
};

const usage = "Usage: worlddock login --hub-url <url> --token <token> | worlddock push <worldId> --repo <owner>/<slug> --asset <assetId> [--asset <assetId> ...] [--note <note>] | worlddock pull <owner>/<slug> | worlds list | worlds export <worldId> | worlds import <file> | worlds pull <owner> <slug>";

describe("worlddock cli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("saves WorldHub login through the local API without writing local files", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stdout: string[] = [];
    const homeDir = await mkdtemp(join(tmpdir(), "worlddock-cli-home-"));
    const configDir = await mkdtemp(join(tmpdir(), "worlddock-cli-config-"));
    tempDirs.push(homeDir, configDir);

    await expect(runWorldDockCli(["login", "--hub-url", "https://hub.worlddock.example", "--token", "wdh_pat_example"], {
      env: { ...env, HOME: homeDir, XDG_CONFIG_HOME: configDir },
      fetch: fetchMock as typeof fetch,
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/connections/hub", expect.objectContaining({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hubUrl: "https://hub.worlddock.example", token: "wdh_pat_example" }),
    }));
    expect(stdout[0]).toBe("WorldHub connection saved.");
    expect(stdout.join("\n")).not.toContain("wdh_pat_example");
    expect(await readdir(homeDir)).toEqual([]);
    expect(await readdir(configDir)).toEqual([]);
  });

  it("requires login flags before calling the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["login", "--hub-url", "https://hub.worlddock.example"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe(usage);
  });

  it("rejects duplicate login flags before calling the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli([
      "login",
      "--hub-url",
      "https://hub.worlddock.example",
      "--hub-url",
      "https://hub-alt.worlddock.example",
      "--token",
      "wdh_pat_example",
    ], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe(usage);
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

  it("pushes selected assets to a WorldHub repository through the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market" },
      release: {
        id: "release_1",
        version: "1.0.0",
        url: "https://hub.worlddock.example/studio/memory-market/releases/release_1",
      },
    }));
    const stdout: string[] = [];

    await expect(runWorldDockCli([
      "push",
      "world_1",
      "--repo",
      "studio/memory-market",
      "--asset",
      "asset_1",
      "--asset",
      "asset_2",
      "--note",
      "Initial release",
    ], {
      env,
      fetch: fetchMock as typeof fetch,
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/world_1/push", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner: "studio",
        slug: "memory-market",
        note: "Initial release",
        selectedAssetIds: ["asset_1", "asset_2"],
      }),
    }));
    expect(stdout[0]).toBe("Pushed release: https://hub.worlddock.example/studio/memory-market/releases/release_1");
  });

  it("requires a valid push repo and at least one asset before calling the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["push", "world_1", "--repo", "studio", "--asset", "asset_1"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["push", "world_1", "--repo", "studio/memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["push", "world_1", "--repo", "../memory-market", "--asset", "asset_1"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["push", "world_1", "--repo", "studio/memory-market", "--repo", "studio/other", "--asset", "asset_1"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["push", "world_1", "--repo", "studio/memory-market", "--asset", "asset_1", "extra"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr).toEqual([usage, usage, usage, usage, usage]);
  });

  it("pulls a WorldHub repository through the formal local API command", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      world: { id: "world_2", name: "Memory Market" },
      remap: { assets: [{ upstreamId: "hub_archive_1", localId: "archive_2" }], counts: { assets: 1, archive: 1, seeds: 0, conflicts: 0 } },
    }));
    const stdout: string[] = [];

    await expect(runWorldDockCli(["pull", "studio/memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledWith("https://api.worlddock.test/v1/worlds/pull", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: "studio", slug: "memory-market" }),
    }));
    expect(stdout[0]).toBe("Pulled world: world_2");
  });

  it("requires a valid pull repo before calling the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["pull", "../memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["pull", "studio/memory-market", "extra"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr).toEqual([usage, usage]);
  });

  it("keeps the temporary worlds pull alias through the local API", async () => {
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

  it("validates the temporary worlds pull alias before calling the local API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["worlds", "pull", "..", "memory-market"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);
    await expect(runWorldDockCli(["worlds", "pull", "studio", "memory-market", "extra"], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr).toEqual([usage, usage]);
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
    expect(stderr[0]).toBe(usage);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
