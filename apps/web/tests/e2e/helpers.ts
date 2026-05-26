import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright/test";

export async function gotoApp(page: Page) {
  const indexUrl = pathToFileURL(join(process.cwd(), "out", "index.html")).href;
  await page.goto(indexUrl);
}
