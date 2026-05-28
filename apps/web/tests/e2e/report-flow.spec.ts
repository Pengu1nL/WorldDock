import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("user reports repository and creator profile through alpha manual flow", async ({ page }) => {
  const reports: Array<{ path: string; body: any }> = [];
  await setupReportApi(page, reports);

  await gotoApp(page, { installMocks: false });
  await page.getByRole("button", { name: /界仓/ }).first().click();
  await page.getByText("Memory Market").click();

  await page.getByRole("button", { name: "举报" }).click();
  await page.getByLabel("举报原因").selectOption("spam");
  await page.getByLabel("举报说明").fill("这个仓库疑似垃圾内容。");
  await page.getByRole("button", { name: "提交举报" }).click();
  await expect(page.getByText("Alpha 团队会人工处理", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "创作者" }).click();
  await expect(page.getByRole("heading", { name: "ren" })).toBeVisible();
  await page.getByRole("button", { name: "举报" }).click();
  await page.getByLabel("举报原因").selectOption("other");
  await page.getByLabel("举报说明").fill("创作者主页资料需要人工复核。");
  await page.getByRole("button", { name: "提交举报" }).click();
  await expect(page.getByText("Alpha 团队会人工处理", { exact: true })).toBeVisible();

  expect(reports).toEqual([
    { path: "/v1/repositories/repo_memory/reports", body: { reason: "spam", detail: "这个仓库疑似垃圾内容。" } },
    { path: "/v1/community/creators/ren/reports", body: { reason: "other", detail: "创作者主页资料需要人工复核。" } },
  ]);
});

async function setupReportApi(page: Page, reports: Array<{ path: string; body: any }>) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_report_flow");
  });

  const repository = {
    id: "repo_memory",
    owner: "ren",
    slug: "memory-market",
    name: "Memory Market",
    summary: "记忆可以被买卖。",
    readme: "README：记忆可以被买卖。",
    tags: ["记忆"],
    stars: 4,
    forks: 0,
    updated: "2026-05-27T00:00:00.000Z",
    version: "v1.0.0",
    visibility: "public",
    license: "free-fork-attribution",
    moderationStatus: "visible",
    moderationReason: null,
    releases: [],
    latestRelease: null,
    releaseHistory: [],
    assetCounts: { archive: 0, seeds: 0, conflicts: 0 },
    forkGraph: { repositoryId: "repo_memory", forks: [] },
  };

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [] }) });
  });
  await page.route("**/v1/community/repositories?**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repositories: [repository], nextCursor: null }) });
  });
  await page.route("**/v1/community/repositories/ren/memory-market", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repository }) });
  });
  await page.route("**/v1/community/creators/ren", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        creator: {
          handle: "ren",
          displayName: "ren",
          bio: "Alpha 创作者主页",
          stats: { repositories: 1, stars: 4, forks: 0 },
          tags: ["记忆"],
          latestUpdated: "2026-05-27T00:00:00.000Z",
        },
      }),
    });
  });
  await page.route("**/v1/community/creators/ren/repositories**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repositories: [repository], nextCursor: null }) });
  });
  await page.route("**/v1/repositories/repo_memory/reports", async (route) => {
    reports.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ report: { id: "report_repository", repositoryId: "repo_memory", targetType: "repository", targetId: "repo_memory", status: "open" } }),
    });
  });
  await page.route("**/v1/community/creators/ren/reports", async (route) => {
    reports.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ report: { id: "report_creator", repositoryId: null, targetType: "creator", targetId: "ren", status: "open" } }),
    });
  });
}
