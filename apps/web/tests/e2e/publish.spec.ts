import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator can publish selected assets after confirming local findings", async ({ page }) => {
  const pushes: Array<{ worldId: string; input: Record<string, any> }> = [];

  await gotoApp(page, {
    mockOptions: {
      onPushWorld: (push) => pushes.push(push),
    },
  });

  await page.getByText("潮汐之书").click();
  await page.getByRole("button", { name: "发布" }).click();

  await expect(page.getByRole("heading", { name: "发布" })).toBeVisible();
  await page.getByLabel("Owner").fill("ren");
  await page.getByLabel("Slug").fill("tide-book");
  await page.getByLabel("选择资产 潮汐律").uncheck();

  await expect(page.getByText("命中 1")).toBeVisible();
  await expect(page.getByText("Bearer <redacted>")).toBeVisible();
  await expect(page.locator("text=sk-e2e-secret-should-not-render")).toHaveCount(0);

  const publishButton = page.locator("main").getByRole("button", { name: "发布" });
  await expect(publishButton).toBeDisabled();

  await page.getByLabel("确认允许发布疑似敏感内容").check();
  await publishButton.click();

  await expect(page.getByText("https://hub.worlddock.test/ren/tide-book/releases/rel_e2e")).toBeVisible();
  await expect.poll(() => pushes.length).toBe(1);
  expect(pushes[0]).toEqual({
    worldId: "tide",
    input: {
      owner: "ren",
      slug: "tide-book",
      selectedAssetIds: ["tide_secret"],
      allowSecretFindings: true,
    },
  });
});
