import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("visitor can browse, star, fork, view releases, and report a repository", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /界仓/ }).first().click();

  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await page.getByText("潮汐之书").click();
  await expect(page.getByRole("heading", { name: "潮汐之书" })).toBeVisible();
  await expect(page.getByText("Overview")).toBeVisible();

  await page.getByRole("button", { name: /Star/ }).click();
  await expect(page.getByRole("button", { name: "已 Star" })).toBeVisible();

  await page.getByRole("button", { name: /Releases/ }).click();
  await expect(page.locator("main").getByText("v1.2.0", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /举报/ }).click();
  await page.getByLabel("举报说明").fill("这个仓库需要人工复核。");
  await page.getByRole("button", { name: "提交举报" }).click();
  await expect(page.getByText("Alpha 团队会人工处理", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Fork", exact: true }).click();
  await expect(page.getByText(/Fork 成功/)).toBeVisible();
  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.getByText("潮汐之书 · Fork")).toBeVisible();
});
