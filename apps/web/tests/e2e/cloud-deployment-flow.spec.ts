import { expect, test } from "playwright/test";

test("authenticated cloud world list does not fall back to fixture worlds", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_cloud_alpha");
  });

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "WORLD_LIST_UNAVAILABLE", message: "Cloud worlds unavailable." }),
    });
  });

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await expect(page.getByText("云端世界暂不可用，请稍后重试。")).toBeVisible();
  await expect(page.getByText("潮汐之书")).toHaveCount(0);
});

test("authenticated empty cloud world list hides Local paths and fixture worlds", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_cloud_empty");
  });

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ worlds: [] }),
    });
  });

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await expect(page.getByText("还没有云端世界。")).toBeVisible();
  await expect(page.getByRole("button", { name: /Local/ })).toHaveCount(0);
  await expect(page.getByText("潮汐之书")).toHaveCount(0);
});
