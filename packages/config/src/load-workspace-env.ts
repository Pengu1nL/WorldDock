import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export function loadWorkspaceEnv(importMetaUrl: string) {
  const currentDir = dirname(fileURLToPath(importMetaUrl));
  const envPath = join(currentDir, "../../..", ".env");
  if (existsSync(envPath)) loadEnvFile(envPath);
}
