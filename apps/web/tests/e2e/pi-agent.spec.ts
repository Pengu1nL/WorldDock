import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("pi agent smoke keeps the creation run inspectable", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  const contextButton = page.getByRole("button", { name: "上下文 2" });
  await expect(contextButton).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("可保存设定", { exact: true })).toHaveCount(0);
  await expect(page.getByText("故事种子", { exact: true })).toHaveCount(0);
  await expect(page.getByText("戏剧张力 · 入冲突池", { exact: true })).toHaveCount(0);

  await contextButton.click();
  const drawer = page.getByRole("dialog", { name: "本轮上下文" });
  await expect(drawer.getByText("manifest", { exact: true })).toBeVisible();
  await expect(drawer.getByText("card", { exact: true })).toBeVisible();
  await expect(drawer.getByText("回忆所", { exact: true })).toBeVisible();
  await expect(drawer.getByText("archive · tool")).toBeVisible();
  await expect(drawer.getByText("ctx_archive_trade_law")).toBeVisible();
  await expect(drawer.getByText("pi session · completed")).toBeVisible();
});
