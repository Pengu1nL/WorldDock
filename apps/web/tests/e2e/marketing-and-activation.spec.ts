import { expect, test } from "playwright/test";

test("marketing pages explain alpha pricing and record activation events", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/v1/analytics/events", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ event: { id: `event_${events.length}` } }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WorldDock Cloud Alpha" })).toBeVisible();
  await expect(page.getByText("公开仓库")).toBeVisible();

  await page.getByRole("link", { name: "查看定价" }).click();
  await expect(page.getByRole("heading", { name: "Alpha 免费试用 / Beta 后开放付费" })).toBeVisible();
  await expect(page.getByText("Alpha 阶段不提供 Stripe")).toBeVisible();

  await page.getByRole("button", { name: "加入候补" }).first().click();
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({ name: "billing_placeholder_clicked" });

  const response = await page.goto("/templates");
  expect(response?.status()).toBe(404);
});
