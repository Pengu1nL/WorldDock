import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "playwright/test";

const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || findCachedChromiumHeadlessShell();
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3107";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const chromiumLaunchOptions = chromiumExecutablePath
  ? {
      launchOptions: {
        executablePath: chromiumExecutablePath,
        env: createBrowserEnv(chromiumExecutablePath),
      },
    }
  : {};

function findCachedChromiumHeadlessShell() {
  const cacheDir = join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright");
  if (!existsSync(cacheDir)) return undefined;

  const candidates = readdirSync(cacheDir)
    .filter((entry) => entry.startsWith("chromium_headless_shell-"))
    .map((entry) => {
      const revision = Number(entry.replace("chromium_headless_shell-", ""));
      return {
        revision: Number.isFinite(revision) ? revision : 0,
        executablePath: join(cacheDir, entry, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
      };
    })
    .filter((candidate) => existsSync(candidate.executablePath))
    .sort((a, b) => b.revision - a.revision);

  return candidates[0]?.executablePath;
}

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  webServer: {
    command: `pnpm exec next start --hostname 127.0.0.1 --port ${webPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...chromiumLaunchOptions,
      },
    },
  ],
});

function createBrowserEnv(executablePath: string) {
  const env: Record<string, string> = {
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath,
  };

  for (const key of ["HOME", "PATH", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  return env;
}
