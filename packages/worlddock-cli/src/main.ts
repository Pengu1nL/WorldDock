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
      return login(argv.slice(1), env, output, error);
    }

    const client = createApiClient({
      apiUrl: env.WORLD_DOCK_API_URL ?? "http://localhost:4000",
      token: env.WORLD_DOCK_TOKEN,
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

    if (command === "repositories" && argv[1] === "pull" && argv[2]) {
      const [owner, slug] = parseRepositorySpec(argv[2]);
      const pulled = await client.request<{ package: unknown }>(`/v1/developer-access/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/pull`);
      output(JSON.stringify(worldPackageSchema.parse(pulled.package), null, 2));
      return 0;
    }

    error("Usage: worlddock login | worlds list | worlds export <worldId> | worlds import <file> | repositories pull <owner>/<slug>");
    return 1;
  } catch (caught) {
    error(caught instanceof Error ? caught.message : "Unknown WorldDock CLI error.");
    return 1;
  }
}

function login(argv: string[], env: Record<string, string | undefined>, output: (line: string) => void, error: (line: string) => void) {
  const token = readOption(argv, "--token") ?? env.WORLD_DOCK_TOKEN;
  if (!token) {
    error("Set WORLD_DOCK_TOKEN or pass --token to use Alpha API access.");
    return 1;
  }
  output("WorldDock token detected. Export WORLD_DOCK_TOKEN for subsequent commands.");
  return 0;
}

function createApiClient(input: { apiUrl: string; token?: string; fetch: typeof fetch }) {
  if (!input.token) {
    throw new Error("WORLD_DOCK_TOKEN is required.");
  }

  return {
    async request<T = unknown>(path: string, options: RequestOptions = {}) {
      const response = await input.fetch(`${input.apiUrl.replace(/\/$/, "")}${path}`, {
        method: options.method ?? "GET",
        headers: {
          authorization: `Bearer ${input.token}`,
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      if (!response.ok) {
        throw new Error(`WorldDock API request failed with ${response.status}.`);
      }
      return await response.json() as T;
    },
  };
}

function parseRepositorySpec(spec: string) {
  const parts = spec.split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error("Repository must be formatted as <owner>/<slug>.");
  }
  return parts as [string, string];
}

function readOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorldDockCli().then((code) => {
    process.exitCode = code;
  });
}
