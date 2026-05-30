import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("release wizard blocks worlds without saved assets", async ({ page }) => {
  await setupReleaseWorld(page, { archive: 0, seeds: 0, conflicts: 0 });

  await gotoApp(page, { installMocks: false });
  await page.getByText("Release Ready").click();
  await page.getByRole("button", { name: /^发布$/ }).click();

  await expect(page.getByText("至少保存一个世界资产")).toBeVisible();
  await page.getByLabel("更新说明").fill("准备发布");
  await expect(page.getByRole("button", { name: "确认发布" })).toBeDisabled();
});

test("release wizard publishes a cloud world with release metadata", async ({ page }) => {
  const publishRequests: any[] = [];
  await setupReleaseWorld(page, { archive: 1, seeds: 1, conflicts: 0, publishRequests });

  await gotoApp(page, { installMocks: false });
  await page.getByText("Release Ready").click();
  await page.getByRole("button", { name: /^发布$/ }).click();

  await expect(page.getByText("实体级差异预览")).toBeVisible();
  await page.getByLabel("更新说明").fill("v1 初始发布");
  await page.getByLabel("授权方式").selectOption("free-fork-attribution");
  await page.getByRole("button", { name: "确认发布" }).click();

  await expect.poll(() => publishRequests.length).toBe(1);
  expect(publishRequests[0]).toMatchObject({
    releaseNote: "v1 初始发布",
    license: "free-fork-attribution",
  });
  await expect(page.getByText(/发布成功/)).toBeVisible();
});

test("repository detail can compare, sync, and detach a fork", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_release_flow");
  });
  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [] }) });
  });
  await page.route(/\/v1\/community\/repositories\?sort=updated$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        repositories: [{
          id: "repo_release",
          owner: "ren",
          slug: "release-ready",
          name: "Release Ready",
          summary: "一个准备同步的世界。",
          tags: ["release"],
          stars: 1,
          forks: 1,
          updated: new Date().toISOString(),
          version: "v2.0.0",
          visibility: "public",
          license: "free-fork-attribution",
          releases: [],
        }],
        nextCursor: null,
      }),
    });
  });
  await page.route("**/v1/community/repositories/ren/release-ready", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        repository: {
          id: "repo_release",
          owner: "ren",
          slug: "release-ready",
          name: "Release Ready",
          summary: "一个准备同步的世界。",
          tags: ["release"],
          stars: 1,
          forks: 1,
          updated: new Date().toISOString(),
          version: "v2.0.0",
          visibility: "public",
          license: "free-fork-attribution",
          releases: [],
          releaseHistory: [],
          forkGraph: {
            repositoryId: "repo_release",
            forks: [{ id: "fork_1", sourceReleaseId: "rel_1", targetWorldId: "world_fork", userId: "user_2", createdAt: new Date().toISOString() }],
          },
          assetCounts: { archive: 1, seeds: 0, conflicts: 0 },
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/upstream-diff", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        diff: {
          forkId: "fork_1",
          repositoryId: "repo_release",
          sourceReleaseId: "rel_1",
          upstreamReleaseId: "rel_2",
          hasUpstreamChanges: true,
          changes: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/sync", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        sync: {
          forkId: "fork_1",
          repositoryId: "repo_release",
          sourceReleaseId: "rel_2",
          upstreamReleaseId: "rel_2",
          hasUpstreamChanges: true,
          changes: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
          applied: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
          skipped: [],
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/detach", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ fork: { forkId: "fork_1", detached: true } }) });
  });

  await gotoApp(page, { installMocks: false });
  await page.getByRole("button", { name: "界仓" }).first().click();
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await page.getByText("Release Ready").click();
  await page.getByRole("button", { name: "Forks" }).click();
  await page.getByRole("button", { name: "比较上游" }).click();
  await expect(page.getByText("新增上游规则")).toBeVisible();
  await page.getByRole("button", { name: "同步非冲突变更" }).click();
  await expect(page.getByText("已应用 1 项，跳过 0 项")).toBeVisible();
  await expect(page.getByText("当前 Fork 已经跟上游发布版本一致。")).toBeVisible();
  await expect(page.getByRole("button", { name: "同步非冲突变更" })).toBeDisabled();
  await page.getByRole("button", { name: "Detach" }).click();
  await expect(page.getByText("还没有公开 fork 记录。")).toBeVisible();
});

async function setupReleaseWorld(
  page: Page,
  input: { archive: number; seeds: number; conflicts: number; publishRequests?: any[] },
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_release_flow");
  });

  const world = {
    id: "world_release",
    name: "Release Ready",
    type: "近未来",
    summary: "一个准备发布的世界。",
    tags: ["release"],
    maturity: 42,
    status: "draft",
    visibility: "private",
    archive: input.archive,
    seeds: input.seeds,
    conflicts: input.conflicts,
    updated: new Date().toISOString(),
    mode: "cloud",
  };

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [world] }) });
  });
  await page.route("**/v1/worlds/world_release/archive", async (route) => {
    const archiveEntries = input.archive > 0
      ? [{ id: "archive_1", title: "发布规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] }]
      : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ archiveEntries }) });
  });
  await page.route("**/v1/worlds/world_release/seeds", async (route) => {
    const storySeeds = input.seeds > 0
      ? [{ id: "seed_1", title: "发布种子", hook: "钩子", trigger: "触发", conflict: "冲突", protagonists: "主角", questions: [] }]
      : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ storySeeds }) });
  });
  await page.route("**/v1/worlds/world_release/conflicts", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ conflicts: [] }) });
  });
  await page.route("**/v1/worlds/world_release/releases/preview", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        preflight: {
          ok: input.archive + input.seeds + input.conflicts > 0,
          checks: [
            { code: "assets", ok: input.archive + input.seeds + input.conflicts > 0, message: "至少保存一个世界资产" },
            { code: "license", ok: true, message: "已选择授权方式" },
            { code: "release_note", ok: true, message: "已填写发布说明" },
            { code: "moderation", ok: true, message: "发布前预扫描通过" },
            { code: "entitlement", ok: true, message: "账户包含公开发布权益" },
          ],
          changes: [
            { assetId: "archive:archive_1", kind: "added", title: "发布规则", afterHash: "hash_1" },
          ].slice(0, input.archive),
        },
      }),
    });
  });
  await page.route("**/v1/worlds/world_release/publish", async (route) => {
    input.publishRequests?.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        repository: { id: "repo_1", slug: "release-ready", version: "v1.0.0" },
        release: { id: "rel_1", version: "v1.0.0" },
      }),
    });
  });
}
