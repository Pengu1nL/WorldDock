#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = join(scriptDir, "..");
const contractDir = join(cliDir, "..", "contract");
const tmp = await mkdtemp(join(tmpdir(), "worlddock-cli-pack-"));
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

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

try {
  run("mkdir", ["-p", packDir, consumerDir]);
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: contractDir });
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: cliDir });

  const tarballs = await readdir(packDir);
  const contractTarball = tarballs.find((entry) => entry.startsWith("worlddock-contract-") && entry.endsWith(".tgz"));
  const cliTarball = tarballs.find((entry) => entry.startsWith("worlddock-cli-") && entry.endsWith(".tgz"));
  if (!contractTarball) throw new Error("contract tarball was not created");
  if (!cliTarball) throw new Error("cli tarball was not created");

  run("npm", ["init", "-y"], { cwd: consumerDir });
  run("npm", ["install", join(packDir, contractTarball), join(packDir, cliTarball)], { cwd: consumerDir });

  const result = runCapture(join(consumerDir, "node_modules", ".bin", "worlddock"), [], { cwd: consumerDir });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 1 || !output.includes("Usage: worlddock login")) {
    console.error(output);
    throw new Error("worlddock binary did not print usage for empty arguments");
  }

  console.log("cli package binary ok");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
