import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator can inspect and start repairing consistency issues", async ({ page }) => {
  await gotoApp(page);
  await page.getByText("潮汐之书").click();
  await page.getByRole("button", { name: /矛盾/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "矛盾", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /运行检查/ }).click();
  await expect(page.getByRole("button", { name: /登记口径冲突/ })).toBeVisible();
  await page.getByRole("button", { name: /登记口径冲突/ }).click();
  await page.getByRole("button", { name: /启动修复/ }).click();
  await expect(page.getByRole("heading", { name: /修复登记口径冲突/ })).toBeVisible();
});
