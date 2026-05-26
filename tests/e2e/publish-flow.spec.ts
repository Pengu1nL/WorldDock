import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator can review privacy boundaries and publish a world", async ({ page }) => {
  await gotoApp(page);
  await page.getByText("潮汐之书").click();
  await page.getByRole("button", { name: /发布|Push/ }).click();

  await expect(page.getByRole("heading", { name: "发布世界" })).toBeVisible();
  await expect(page.getByText("不会公开")).toBeVisible();
  await expect(page.getByText("原始对话记录")).toBeVisible();
  await expect(page.getByText("API Key")).toBeVisible();
  await expect(page.getByText("实体级差异预览")).toBeVisible();

  await page.getByLabel("更新说明").fill("补齐公开仓库的首个快照。");
  await page.getByLabel("授权方式").selectOption("free-fork-attribution");
  await page.getByRole("button", { name: /确认发布/ }).click();
  await expect(page.getByText(/发布成功/)).toBeVisible();
  await expect(page.getByText(/已公开/)).toBeVisible();
});
