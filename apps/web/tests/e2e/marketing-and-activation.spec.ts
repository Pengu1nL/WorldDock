import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("marketing pages explain alpha pricing and record activation events", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/v1/analytics/events", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ event: { id: `event_${events.length}` } }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WorldDock Cloud Alpha" })).toBeVisible();
  await expect(page.getByText("公开仓库")).toBeVisible();
  await expect(page.getByRole("link", { name: "申请 Alpha" })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("link", { name: "反馈 Alpha 方向" })).toHaveAttribute("href", "/register?intent=feedback");

  await page.getByRole("link", { name: "申请 Alpha" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect.poll(() => events.some((event) => event.name === "alpha_application_clicked")).toBe(true);
  expect(events).toContainEqual(
    expect.objectContaining({
      name: "alpha_application_clicked",
      context: { source: "marketing_home", intent: "apply_alpha" },
      route: "/",
    }),
  );

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Alpha 免费试用 / Beta 后开放付费" })).toBeVisible();
  await expect(page.getByText("Alpha 阶段不提供 Stripe")).toBeVisible();

  await page.getByRole("button", { name: "加入候补" }).first().click();
  await expect.poll(() => events.some((event) => event.name === "billing_placeholder_clicked")).toBe(true);
  expect(events).toContainEqual(
    expect.objectContaining({
      name: "billing_placeholder_clicked",
      context: { plan: "creator", source: "marketing_pricing" },
      route: "/pricing",
    }),
  );

  const response = await page.goto("/templates");
  expect(response?.status()).toBe(404);
});

test("authenticated settings feedback submits alpha activation event", async ({ page }) => {
  const events: any[] = [];
  await gotoApp(page, { onAnalyticsEvent: (event) => events.push(event) });

  await page.getByRole("button", { name: /设置/ }).click();
  await page.getByLabel("Alpha 反馈").fill("希望 Alpha 增加更清晰的发布前检查。");
  await page.getByRole("button", { name: "提交反馈" }).click();

  await expect(page.getByText("反馈已提交")).toBeVisible();
  await expect.poll(() => events.some((event) => event.name === "alpha_feedback_submitted")).toBe(true);
  expect(events).toContainEqual(
    expect.objectContaining({
      name: "alpha_feedback_submitted",
      context: expect.objectContaining({
        source: "support_entry",
        route: "/app/settings",
        tab: "billing",
      }),
    }),
  );
});
