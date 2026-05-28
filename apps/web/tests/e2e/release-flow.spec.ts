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
