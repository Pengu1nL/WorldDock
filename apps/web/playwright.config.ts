import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "playwright/test";

const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || findCachedChromiumHeadlessShell();
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
    command: "PORT=3100 pnpm start",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
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
