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

test("mobile user can scan main work surfaces without horizontal overflow", async ({ page }) => {
  await gotoApp(page);

  const assertNoOverflow = async (surface: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${surface} should not have horizontal overflow`).toBe(false);
  };
  const navButton = (name: string) => page.locator("button.rail-item").filter({ hasText: name });
  const tideWorld = page.locator("main").getByText("潮汐之书", { exact: true });

  await expect(tideWorld).toBeVisible();
  await assertNoOverflow("home");

  await tideWorld.click();
  await expect(page.locator("main").getByLabel("继续推演", { exact: true })).toBeVisible();
  await assertNoOverflow("workbench");

  await navButton("资产库").click();
  await expect(page.getByRole("heading", { name: "资产库", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开资产 潮汐律" })).toBeVisible();
  await assertNoOverflow("asset library");

  await navButton("矛盾").click();
  await expect(page.getByRole("heading", { name: "矛盾", exact: true })).toBeVisible();
  await expect(page.getByText("暂无待处理问题", { exact: true })).toBeVisible();
  await assertNoOverflow("consistency");

  await navButton("发布").click();
  await expect(page.getByRole("heading", { name: "发布", exact: true })).toBeVisible();
  await expect(page.getByLabel("选择资产 潮汐律", { exact: true })).toBeVisible();
  await assertNoOverflow("publish");
});
