import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator can create a world, continue a run, and save suggestions", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await expect(page.getByText("可保存设定", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("继续推演").fill("检查亲属记忆交易的制度漏洞。");
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.getByRole("button", { name: /本轮引用了/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "保存 《记忆交易法》" }).first().click();
  await expect(page.getByText(/已保存到档案/)).toBeVisible();
  await page.getByRole("button", { name: /档案/ }).click();
  await expect(page.locator("main").getByText("《记忆交易法》", { exact: true })).toBeVisible();
});
