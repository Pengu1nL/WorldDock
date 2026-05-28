import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("community product flow uses paginated APIs and real repository snapshot detail", async ({ page }) => {
  await setupCommunityApi(page);

  await gotoApp(page, { installMocks: false });
  await page.getByRole("button", { name: /界仓/ }).first().click();

  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await expect(page.getByText("Memory Market")).toBeVisible();
  await expect(page.getByText("Removed World")).toHaveCount(0);

  await page.getByLabel("搜索公开世界").fill("memory");
  await expect(page.getByText("Memory Market")).toBeVisible();
  await page.getByText("Memory Market").click();

  await expect(page.getByRole("heading", { name: "Memory Market" })).toBeVisible();
  await expect(page.getByText("初始发布")).toBeVisible();
  await expect(page.getByText("Archive 1")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("交易法")).toBeVisible();

  await page.getByRole("button", { name: "Seeds" }).click();
  await expect(page.getByText("继承的童年")).toBeVisible();

  await page.getByRole("button", { name: "Conflicts" }).click();
  await expect(page.getByText("人格权冲突")).toBeVisible();

  await page.getByRole("button", { name: "Releases" }).click();
  await expect(page.locator("main").getByText("v1.0.0", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Forks" }).click();
  await expect(page.getByText("fork_1")).toBeVisible();

  await page.getByRole("button", { name: "创作者" }).click();
  await expect(page.getByRole("heading", { name: "ren" })).toBeVisible();
  await expect(page.getByText("1 repositories")).toBeVisible();
  await page.getByText("Memory Market").click();

  await page.getByRole("button", { name: "收藏" }).click();
  await expect(page.getByText(/已加入收藏夹/)).toBeVisible();
  await page.getByRole("button", { name: "返回 Explore" }).click();
  await page.getByRole("button", { name: "收藏夹" }).click();
  await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Memory Market" })).toBeVisible();
});

async function setupCommunityApi(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_community_product");
  });

  const repository = {
    id: "repo_memory",
    owner: "ren",
    slug: "memory-market",
    name: "Memory Market",
    summary: "记忆可以被买卖。",
    readme: "README：记忆可以被买卖，交易记录会改变人格权边界。",
    tags: ["记忆", "交易"],
    stars: 12,
    forks: 1,
    updated: "2026-05-27T00:00:00.000Z",
    version: "v1.0.0",
    visibility: "public",
    license: "free-fork-attribution",
    moderationStatus: "visible",
    moderationReason: null,
    releases: [
      {
        version: "v1.0.0",
        status: "published",
        updated: "2026-05-27T00:00:00.000Z",
        note: "初始发布",
        addedSettings: 1,
        changedSettings: 0,
        removedSettings: 0,
        addedSeeds: 1,
        source: "cloud-publish",
      },
    ],
    latestRelease: {
      id: "rel_1",
      repositoryId: "repo_memory",
      version: "v1.0.0",
      note: "初始发布",
      status: "published",
      license: "free-fork-attribution",
      createdAt: "2026-05-27T00:00:00.000Z",
    },
    releaseHistory: [
      {
        id: "rel_1",
        repositoryId: "repo_memory",
        version: "v1.0.0",
        note: "初始发布",
        status: "published",
        license: "free-fork-attribution",
        createdAt: "2026-05-27T00:00:00.000Z",
      },
    ],
    assetCounts: { archive: 1, seeds: 1, conflicts: 1 },
    forkGraph: {
      repositoryId: "repo_memory",
      forks: [
        {
          id: "fork_1",
          sourceReleaseId: "rel_1",
          targetWorldId: "world_fork",
          userId: "user_2",
          createdAt: "2026-05-27T00:00:00.000Z",
        },
      ],
    },
  };

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [] }) });
  });

  await page.route("**/v1/community/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/community/repositories") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repositories: [repository], nextCursor: null }) });
      return;
    }
    if (url.pathname === "/v1/community/repositories/ren/memory-market") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repository }) });
      return;
    }
    if (url.pathname === "/v1/community/repositories/repo_memory/assets") {
      const kind = url.searchParams.get("kind");
      const assets = {
        archive: [{ id: "archive_1", assetId: "archive:archive_1", kind: "archive", title: "交易法", category: "世界规则", summary: "摘要", body: "正文", related: [] }],
        seed: [{ id: "seed_1", assetId: "seed:seed_1", kind: "seed", title: "继承的童年", category: "story-seed", summary: "钩子", body: "冲突", related: ["问题"] }],
        conflict: [{ id: "conflict_1", assetId: "conflict:conflict_1", kind: "conflict", title: "人格权冲突", category: "conflict", summary: "摘要", body: "正文", related: [] }],
      } as const;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ repositoryId: "repo_memory", releaseId: "rel_1", assets: assets[(kind ?? "archive") as keyof typeof assets], nextCursor: null }),
      });
      return;
    }
    if (url.pathname === "/v1/community/creators/ren") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          creator: {
            handle: "ren",
            displayName: "ren",
            bio: "Alpha 创作者主页",
            stats: { repositories: 1, stars: 12, forks: 1 },
            tags: ["记忆", "交易"],
            latestUpdated: "2026-05-27T00:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (url.pathname === "/v1/community/creators/ren/repositories") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ repositories: [repository], nextCursor: null }) });
      return;
    }
    if (url.pathname === "/v1/community/repositories/repo_memory/collections") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          collection: {
            id: "collection_1",
            repositoryId: "repo_memory",
            userId: "user_2",
            name: "saved",
            createdAt: "2026-05-27T00:00:00.000Z",
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND", message: "not found" }) });
  });
}
