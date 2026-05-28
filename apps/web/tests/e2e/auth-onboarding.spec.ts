import { expect, test } from "playwright/test";

test("new user can register, complete onboarding, and enter the app", async ({ page }) => {
  await page.route("**/api/auth/sign-up/email", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        token: "session_alpha",
        user: { id: "user_1", email: "writer@example.com", name: "Writer" },
      }),
    });
  });
  await page.route("**/v1/account/onboarding/complete", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          userId: "user_1",
          displayName: "Writer",
          handle: "writer",
          onboardingCompletedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto("/register");
  await page.getByLabel("邮箱").fill("writer@example.com");
  await page.getByLabel("密码").fill("correct horse battery");
  await page.getByLabel("显示名称").fill("Writer");
  await page.getByRole("button", { name: "注册" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("worlddock.sessionToken"))).toBe("session_alpha");

  await page.getByRole("button", { name: "小说世界观" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "悬疑奇想" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "从空白世界开始" }).click();
  await page.getByRole("button", { name: "进入 WorldDock" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
});

test("login shows an error for invalid credentials", async ({ page }) => {
  await page.route("**/api/auth/sign-in/email", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "AUTH_REQUIRED", message: "邮箱或密码不正确。" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("邮箱").fill("writer@example.com");
  await page.getByLabel("密码").fill("wrong password");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.locator(".auth-error")).toHaveText("邮箱或密码不正确。");
});
