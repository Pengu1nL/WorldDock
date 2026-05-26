import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile user can reach core creation path without horizontal overflow", async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await page.getByRole("button", { name: /新建世界/ }).click();
  await expect(page.getByRole("heading", { name: "创建世界" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
