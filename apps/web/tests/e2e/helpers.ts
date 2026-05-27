import type { Page } from "playwright/test";

export async function gotoApp(page: Page) {
  await page.goto("/app");
}
