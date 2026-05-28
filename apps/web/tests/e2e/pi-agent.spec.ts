import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("pi agent smoke keeps the creation run inspectable", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await expect(page.getByText("可保存设定", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "上下文 1" })).toBeVisible();
});
