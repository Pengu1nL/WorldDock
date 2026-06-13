#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { worldPackageSchema } from "@worlddock/contract";

type CliOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  readTextFile?: (path: string) => Promise<string>;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export async function runWorldDockCli(argv = process.argv.slice(2), options: CliOptions = {}) {
  const env = options.env ?? process.env;
  const output = options.stdout ?? ((line: string) => console.log(line));
  const error = options.stderr ?? ((line: string) => console.error(line));
  const command = argv[0];

  try {
    if (command === "login") {
      return login(output);
    }

    const client = createApiClient({
      apiUrl: env.WORLD_DOCK_API_URL ?? "http://localhost:4000",
      fetch: options.fetch ?? fetch,
    });

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

    if (command === "worlds" && argv[1] === "pull" && argv[2] && argv[3]) {
      output(JSON.stringify(await client.request("/v1/worlds/pull", {
        method: "POST",
        body: { owner: argv[2], slug: argv[3] },
      }), null, 2));
      return 0;
    }

    error("Usage: worlddock login | worlds list | worlds export <worldId> | worlds import <file> | worlds pull <owner> <slug>");
    return 1;
  } catch (caught) {
    error(caught instanceof Error ? caught.message : "Unknown WorldDock CLI error.");
    return 1;
  }
}

function login(output: (line: string) => void) {
  output("WorldDock Hub login is not configured yet. Run P4 to enable PAT connections.");
  return 0;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorldDockCli().then((code) => {
    process.exitCode = code;
  });
}
