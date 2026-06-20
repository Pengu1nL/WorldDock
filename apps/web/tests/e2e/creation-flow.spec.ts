import { expect, test } from "playwright/test";
import { installApiMocks, installSessionAssetMocks } from "./helpers";

test("creator can create a world and promote a session potential asset", async ({ page }) => {
  const legacyAgentRuns: Array<{ worldId: string; input: Record<string, any> }> = [];
  await installApiMocks(page, {
    onLegacyAgentRun: (run) => legacyAgentRuns.push(run),
  });
  const sessionMocks = await installSessionAssetMocks(page);
  await page.goto("/app");
  await page.getByRole("heading", { name: "我的世界" }).waitFor();

  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await page.getByLabel("继续推演").fill("检查亲属记忆交易的制度漏洞。");
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.getByText("亲属记忆交易需要冷静期复核。")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /潜在资产/ }).click();
  await expect(page.getByText("记忆交易许可")).toBeVisible();
  await page.getByRole("button", { name: "沉淀" }).click();
  await expect.poll(() => sessionMocks.wasPromoted()).toBe(true);
  await expect(page.getByText("已沉淀", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "沉淀" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /资产库/ }).click();
  await expect(page.locator("main").getByText("《记忆交易法》", { exact: true })).toBeVisible();
  expect(legacyAgentRuns).toEqual([]);
});
