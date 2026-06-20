#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { worldPackageSchema } from "@worlddock/contract";

type CliOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  readTextFile?: (path: string) => Promise<string>;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

const USAGE = "Usage: worlddock login --hub-url <url> --token <token> | worlddock push <worldId> --repo <owner>/<slug> --asset <assetId> [--asset <assetId> ...] [--note <note>] | worlddock pull <owner>/<slug> | worlds list | worlds export <worldId> | worlds import <file> | worlds pull <owner> <slug>";

export async function runWorldDockCli(argv = process.argv.slice(2), options: CliOptions = {}) {
  const env = options.env ?? process.env;
  const output = options.stdout ?? ((line: string) => console.log(line));
  const error = options.stderr ?? ((line: string) => console.error(line));
  const command = argv[0];

  try {
    const client = createApiClient({
      apiUrl: env.WORLD_DOCK_API_URL ?? "http://localhost:4000",
      fetch: options.fetch ?? fetch,
    });

    if (command === "login") {
      const parsed = parseFlags(argv.slice(1), new Set(["--hub-url", "--token"]));
      const hubUrl = getSingleFlag(parsed, "--hub-url");
      const token = getSingleFlag(parsed, "--token");
      if (!parsed.ok || !hubUrl || !token) return usage(error);

      await client.request("/v1/connections/hub", { method: "PUT", body: { hubUrl, token } });
      output("WorldHub connection saved.");
      return 0;
    }

    if (command === "push" && argv[1]) {
      const parsed = parseFlags(argv.slice(2), new Set(["--repo", "--asset", "--note"]), new Set(["--asset"]));
      const repo = parseRepo(getSingleFlag(parsed, "--repo"));
      const selectedAssetIds = parsed.values.get("--asset") ?? [];
      const note = getSingleFlag(parsed, "--note");
      if (!parsed.ok || !repo || selectedAssetIds.length === 0) return usage(error);

      const pushed = await client.request<{ release?: { url?: string } }>(`/v1/worlds/${encodeURIComponent(argv[1])}/push`, {
        method: "POST",
        body: { owner: repo.owner, slug: repo.slug, note, selectedAssetIds },
      });
      output(`Pushed release: ${pushed.release?.url ?? JSON.stringify(pushed)}`);
      return 0;
    }

    if (command === "pull" && argv[1] && argv.length === 2) {
      const repo = parseRepo(argv[1]);
      if (!repo) return usage(error);

      const pulled = await client.request<PullWorldResponse>("/v1/worlds/pull", {
        method: "POST",
        body: { owner: repo.owner, slug: repo.slug },
      });
      output(`Pulled world: ${getPulledWorldId(pulled) ?? JSON.stringify(pulled)}`);
      return 0;
    }

    if (command === "worlds" && argv[1] === "list") {
      output(JSON.stringify(await client.request("/v1/worlds"), null, 2));
      return 0;
    }

    if (command === "worlds" && argv[1] === "export" && argv[2]) {
      const created = await client.request<{ export: { id: string } }>(`/v1/worlds/${encodeURIComponent(argv[2])}/export`, { method: "POST" });
      const downloaded = await client.request<{ package: unknown }>(`/v1/exports/${encodeURIComponent(created.export.id)}`);
      output(JSON.stringify(downloaded.package, null, 2));
      return 0;
    }

    if (command === "worlds" && argv[1] === "import" && argv[2]) {
      const readText = options.readTextFile ?? ((path: string) => readFile(path, "utf8"));
      const parsed = worldPackageSchema.parse(JSON.parse(await readText(argv[2])));
      output(JSON.stringify(await client.request("/v1/worlds/import", { method: "POST", body: { package: parsed } }), null, 2));
      return 0;
    }

    if (command === "worlds" && argv[1] === "pull") {
      if (argv.length !== 4 || !isRepoPathSegment(argv[2]) || !isRepoPathSegment(argv[3])) return usage(error);
      const pulled = await client.request<PullWorldResponse>("/v1/worlds/pull", {
        method: "POST",
        body: { owner: argv[2], slug: argv[3] },
      });
      output(JSON.stringify(pulled, null, 2));
      return 0;
    }

    return usage(error);
  } catch (caught) {
    error(caught instanceof Error ? caught.message : "Unknown WorldDock CLI error.");
    return 1;
  }
}

function createApiClient(input: { apiUrl: string; fetch: typeof fetch }) {
  return {
    async request<T = unknown>(path: string, options: RequestOptions = {}) {
      const requestInit: RequestInit = {
        method: options.method ?? "GET",
      };
      if (options.body !== undefined) {
        requestInit.headers = { "content-type": "application/json" };
        requestInit.body = JSON.stringify(options.body);
      }
      const response = await input.fetch(`${input.apiUrl.replace(/\/$/, "")}${path}`, requestInit);
      if (!response.ok) {
        throw new Error(`WorldDock API request failed with ${response.status}.`);
      }
      return await response.json() as T;
    },
  };
}

type ParsedFlags = {
  ok: boolean;
  values: Map<string, string[]>;
};

type PullWorldResponse = {
  id?: string;
  createdWorldId?: string;
  world?: {
    id?: string;
  };
};

function usage(error: (line: string) => void) {
  error(USAGE);
  return 1;
}

function parseFlags(args: string[], allowed: Set<string>, repeatable = new Set<string>()): ParsedFlags {
  const values = new Map<string, string[]>();

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !allowed.has(flag) || !value || value.startsWith("--")) {
      return { ok: false, values };
    }
    if (!repeatable.has(flag) && values.has(flag)) {
      return { ok: false, values };
    }
    values.set(flag, [...(values.get(flag) ?? []), value]);
  }

  return { ok: true, values };
}

function getSingleFlag(parsed: ParsedFlags, flag: string) {
  const values = parsed.values.get(flag);
  return values?.length === 1 ? values[0] : undefined;
}

function parseRepo(repo: string | undefined) {
  const parts = repo?.split("/");
  if (!parts || parts.length !== 2) return undefined;
  const [owner, slug] = parts;
  if (!isRepoPathSegment(owner) || !isRepoPathSegment(slug)) return undefined;
  return { owner, slug };
}

function getPulledWorldId(response: PullWorldResponse) {
  return response.world?.id ?? response.createdWorldId ?? response.id;
}

function isRepoPathSegment(value: string | undefined) {
  return Boolean(
    value &&
    value.trim().length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\"),
  );
}

function isDirectCliEntry() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isDirectCliEntry()) {
  runWorldDockCli().then((code) => {
    process.exitCode = code;
  });
}
