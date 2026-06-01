import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator reads notifications, sees activity, and submits alpha feedback with context", async ({ page }) => {
  const readRequests: string[] = [];
  const feedbackRequests: any[] = [];
  const listRequests = { notifications: 0, activity: 0 };
  await setupNotificationsApi(page, readRequests, feedbackRequests, listRequests);

  await gotoApp(page, { installMocks: false });
  await page.getByLabel("设置").click();
  await page.getByRole("button", { name: "通知反馈" }).click();

  await expect(page.getByLabel("未读通知数")).toHaveText("2");
  await expect(page.getByText("世界已发布")).toBeVisible();
  await page.getByText("世界已发布").click();
  await expect.poll(() => readRequests).toEqual(["notification_1"]);
  await expect(page.getByLabel("未读通知数")).toHaveText("1");

  await page.getByRole("button", { name: "活动" }).click();
  await expect(page.getByText("Release 已生成")).toBeVisible();
  await expect(page.getByText("Beta 支付候补已记录")).toBeVisible();

  await page.getByLabel("Alpha 反馈").fill("希望通知中心支持按世界筛选。");
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect.poll(() => feedbackRequests.length).toBe(1);
  expect(feedbackRequests[0]).toMatchObject({
    message: "希望通知中心支持按世界筛选。",
    context: {
      route: "/app/settings",
    },
  });
  await expect(page.getByText("Alpha 团队会人工处理这条反馈。")).toBeVisible();
  await expect.poll(() => listRequests.activity).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("反馈已收到")).toBeVisible();

  await page.getByRole("button", { name: "通知", exact: true }).click();
  await expect.poll(() => listRequests.notifications).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("反馈已收到")).toBeVisible();
  await expect(page.getByLabel("未读通知数")).toHaveText("2");
});

async function setupNotificationsApi(
  page: Page,
  readRequests: string[],
  feedbackRequests: any[],
  listRequests: { notifications: number; activity: number },
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_notifications");
  });

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        worlds: [{
          id: "world_1",
          name: "通知之城",
          type: "城市奇幻",
          summary: "用于通知反馈测试的世界。",
          tags: ["通知"],
          maturity: 62,
          status: "published",
          visibility: "public",
          archive: 1,
          seeds: 0,
          conflicts: 0,
          updated: "2026-06-01T00:00:00.000Z",
          mode: "cloud",
        }],
      }),
    });
  });

  await page.route("**/v1/notifications", async (route) => {
    listRequests.notifications += 1;
    const worldReadAt = readRequests.includes("notification_1") ? "2026-06-01T00:03:00.000Z" : null;
    const notifications = [
      {
        id: "notification_1",
        userId: "user_1",
        type: "world_published",
        title: "世界已发布",
        body: "通知之城 已发布到界仓。",
        readAt: worldReadAt,
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "notification_2",
        userId: "user_1",
        type: "low_balance",
        title: "创作点余额偏低",
        body: "当前余额为 ¥4.20，Alpha 阶段不会自动扣款。",
        readAt: null,
        createdAt: "2026-06-01T00:01:00.000Z",
      },
      ...(feedbackRequests.length > 0 ? [{
        id: "notification_feedback",
        userId: "user_1",
        type: "support_feedback_submitted",
        title: "反馈已收到",
        body: "Alpha 团队会在产品节奏中处理这条反馈。",
        readAt: null,
        createdAt: "2026-06-01T00:04:00.000Z",
      }] : []),
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        unreadCount: notifications.filter((notification) => !notification.readAt).length,
        notifications,
      }),
    });
  });

  await page.route("**/v1/activity", async (route) => {
    listRequests.activity += 1;
    const activity = [
      {
        id: "activity_1",
        userId: "user_1",
        type: "release_published",
        title: "Release 已生成",
        body: "通知之城 v1.0.0 已生成公开快照。",
        targetType: "release",
        targetId: "release_1",
        metadata: { repositoryId: "repo_1" },
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "activity_2",
        userId: "user_1",
        type: "billing_placeholder_clicked",
        title: "Beta 支付候补已记录",
        body: "你已登记 creator 方案，Alpha 阶段不会发起真实扣款。",
        targetType: "billing",
        targetId: "intent_1",
        metadata: { plan: "creator" },
        createdAt: "2026-06-01T00:02:00.000Z",
      },
      ...(feedbackRequests.length > 0 ? [{
        id: "activity_feedback",
        userId: "user_1",
        type: "support_feedback_submitted",
        title: "反馈已收到",
        body: "Alpha 团队会在产品节奏中处理这条反馈。",
        targetType: "support",
        targetId: "feedback_1",
        metadata: { route: "/app/settings" },
        createdAt: "2026-06-01T00:04:00.000Z",
      }] : []),
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        activity,
      }),
    });
  });

  await page.route("**/v1/notifications/*/read", async (route) => {
    const id = route.request().url().split("/v1/notifications/")[1].split("/read")[0];
    readRequests.push(id);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        notification: {
          id,
          userId: "user_1",
          type: "world_published",
          title: "世界已发布",
          body: "通知之城 已发布到界仓。",
          readAt: "2026-06-01T00:03:00.000Z",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/v1/support/feedback", async (route) => {
    feedbackRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        feedback: {
          id: "feedback_1",
          userId: "user_1",
          message: feedbackRequests[0].message,
          context: feedbackRequests[0].context,
          status: "open",
          createdAt: "2026-06-01T00:04:00.000Z",
        },
        notification: {
          id: "notification_feedback",
          userId: "user_1",
          type: "support_feedback_submitted",
          title: "反馈已收到",
          body: "Alpha 团队会在产品节奏中处理这条反馈。",
          readAt: null,
          createdAt: "2026-06-01T00:04:00.000Z",
        },
      }),
    });
  });
}
