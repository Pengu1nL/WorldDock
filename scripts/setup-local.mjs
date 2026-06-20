#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, stat } from "node:fs/promises";

const composeArgs = ["compose", "-p", "worlddock"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

if (!(await exists(".env"))) {
  await copyFile(".env.example", ".env");
  console.log("created .env from .env.example");
} else {
  console.log(".env already exists");
}

await run("docker", [...composeArgs, "up", "-d", "postgres"]);
await run("pnpm", ["--filter", "@worlddock/db", "prisma:generate"]);
await run("pnpm", ["--filter", "@worlddock/db", "prisma:migrate:deploy"]);

console.log("WorldDock local setup complete");
