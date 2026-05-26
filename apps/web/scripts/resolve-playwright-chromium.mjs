import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function resolvePlaywrightChromium() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const cacheDir = join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright");

  if (!existsSync(cacheDir)) {
    return "";
  }

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

  return candidates[0]?.executablePath ?? "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(resolvePlaywrightChromium());
}
