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
  await expect(page.getByText(/举报已提交/)).toBeVisible();

  await page.getByRole("button", { name: "Fork", exact: true }).click();
  await expect(page.getByText(/Fork 成功/)).toBeVisible();
  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.getByText("潮汐之书 · Fork")).toBeVisible();
});
