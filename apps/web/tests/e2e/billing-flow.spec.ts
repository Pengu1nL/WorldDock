import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("billing page shows alpha usage and waitlist-only payment actions", async ({ page }) => {
  const placeholderRequests: any[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_billing_flow");
  });
  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [] }) });
  });
  await page.route("**/v1/billing/usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        usage: {
          balance: { userId: "user_1", currency: "CNY", balanceCents: 9876, lowBalanceThresholdCents: 500, updatedAt: new Date().toISOString() },
          lastAgentRun: {
            agentRunId: "run_1",
            tokenUsage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
            costCents: 1,
            createdAt: new Date().toISOString(),
          },
          entries: [
            { id: "ule_1", accountId: "ba_1", userId: "user_1", agentRunId: null, type: "credit_granted", amountCents: 10000, tokenUsage: null, reason: "initial free credit", createdAt: new Date().toISOString() },
            { id: "ule_2", accountId: "ba_1", userId: "user_1", agentRunId: "run_1", type: "model_run_settled", amountCents: 99, tokenUsage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 }, reason: "settle agent run", createdAt: new Date().toISOString() },
          ],
          placeholderIntents: [],
        },
      }),
    });
  });
  await page.route("**/v1/billing/placeholder-intents", async (route) => {
    placeholderRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ intent: { id: "bpi_1", userId: "user_1", accountId: "ba_1", plan: "creator", source: "alpha_ui", status: "captured", createdAt: new Date().toISOString() } }),
    });
  });

  await gotoApp(page, { installMocks: false });
  await page.getByLabel("设置").click();

  await expect(page.getByText("当前 Alpha 余额")).toBeVisible();
  await expect(page.getByText("¥98.76")).toBeVisible();
  await expect(page.getByText("200 tokens / ¥0.01")).toBeVisible();
  await expect(page.getByText("Beta 即将开放").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "支付暂未开放" }).first()).toBeDisabled();

  await page.getByRole("button", { name: "加入候补" }).first().click();
  await expect.poll(() => placeholderRequests.length).toBe(1);
  expect(placeholderRequests[0]).toEqual({ plan: "creator" });
});
