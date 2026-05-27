import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("user can inspect billing, model, and community connection states", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /设置/ }).click();

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByText("当前 Alpha 余额")).toBeVisible();

  await page.getByRole("button", { name: "模型" }).click();
  await expect(page.getByLabel("MODEL_BASE_URL")).toBeVisible();
  await page.getByRole("button", { name: /测试连接/ }).click();
  await expect(page.getByText("模型连接正常", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "社区连接" }).click();
  await page.getByLabel("Access Token").fill("wd_mock_token");
  await page.getByRole("button", { name: /保存 Token/ }).click();
  await expect(page.getByText("Token 已保存", { exact: true })).toBeVisible();
});
