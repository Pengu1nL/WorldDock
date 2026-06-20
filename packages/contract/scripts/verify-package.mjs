#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(scriptDir, "..");
const tmp = await mkdtemp(join(tmpdir(), "worlddock-contract-pack-"));
const packDir = join(tmp, "pack");
const consumerDir = join(tmp, "consumer");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  run("mkdir", ["-p", packDir, consumerDir]);
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: packageDir });
  const tarball = (await readdir(packDir)).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("contract tarball was not created");

  run("npm", ["init", "-y"], { cwd: consumerDir });
  run("npm", ["install", join(packDir, tarball)], { cwd: consumerDir });

  await writeFile(join(consumerDir, "index.mjs"), `
import {
  agentSessionSchema,
  consistencyIssueSchema,
  potentialAssetSchema,
  releaseSnapshotSchema,
  worldPackageSchema
} from "@worlddock/contract";
import { officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import { pushReleaseRequestSchema } from "@worlddock/contract/hub-api";
import { worldAssetPatchBatchSchema } from "@worlddock/contract/assets";
import { worldSchema } from "@worlddock/contract/world";

const world = worldSchema.parse({
  id: "world_1",
  name: "Memory Market",
  type: "city",
  summary: "A city built around traded memories.",
  tags: ["urban"],
  status: "draft",
  visibility: "private",
  archive: 0,
  seeds: 0,
  conflicts: 0,
  updated: "2026-06-20",
  mode: "local",
  maturity: 32,
  hasUnsaved: false,
  hasUnpushed: false
});

releaseSnapshotSchema.parse({
  contractVersion: "0.1.1",
  repository: { owner: "studio", slug: "memory-market", name: "Memory Market" },
  package: {
    format: "worlddock.world-package.v1",
    exportedAt: "2026-06-20T00:00:00.000Z",
    world: {
      name: "Memory Market",
      type: "city",
      summary: "A city built around traded memories.",
      tags: ["urban"],
      maturity: 32
    },
    assets: [],
    releases: []
  },
  createdAt: "2026-06-20T00:00:00.000Z",
  assets: []
});

worldPackageSchema.parse({
  format: "worlddock.world-package.v1",
  exportedAt: "2026-06-20T00:00:00.000Z",
  world: {
    name: "Memory Market",
    type: "city",
    summary: "A city built around traded memories.",
    tags: ["urban"],
    maturity: 32
  },
  assets: [],
  releases: []
});

agentSessionSchema.parse({
  id: "session_1",
  worldId: "world_1",
  kind: "world_exploration",
  title: "Memory Market",
  status: "active",
  current: true,
  subjects: [],
  contextItems: [],
  metadata: {},
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z"
});

potentialAssetSchema.parse({
  id: "potential_1",
  worldId: "world_1",
  sessionId: "session_1",
  runId: null,
  type: "rule",
  title: "Memory Trading Permit",
  summary: "All memory trades require registration.",
  evidence: [],
  status: "active",
  promotedAssetId: null,
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z"
});

consistencyIssueSchema.parse({
  id: "issue_1",
  worldId: "world_1",
  title: "Permit conflict",
  description: "Two rules disagree.",
  severity: "normal",
  status: "open",
  subjectAssetIds: [],
  evidence: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z"
});

pushReleaseRequestSchema.parse({
  repository: { owner: "studio", slug: "memory-market" },
  snapshot: {
    contractVersion: "0.1.1",
    repository: { owner: "studio", slug: "memory-market", name: "Memory Market" },
    package: {
      format: "worlddock.world-package.v1",
      exportedAt: "2026-06-20T00:00:00.000Z",
      world: {
        name: "Memory Market",
        type: "city",
        summary: "A city built around traded memories.",
        tags: ["urban"],
        maturity: 32
      },
      assets: [],
      releases: []
    },
    createdAt: "2026-06-20T00:00:00.000Z",
    assets: []
  }
});

worldAssetPatchBatchSchema.parse({
  id: "batch_1",
  worldId: "world_1",
  sessionId: "session_1",
  issueId: null,
  status: "applied",
  patchIds: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  appliedAt: null,
  revertedAt: null
});

console.log("contract package import ok", world.id, officialWorldAssetTypeSchema.parse("rule"));
`, "utf8");

  run("node", ["index.mjs"], { cwd: consumerDir });
} finally {
  await rm(tmp, { recursive: true, force: true });
}
