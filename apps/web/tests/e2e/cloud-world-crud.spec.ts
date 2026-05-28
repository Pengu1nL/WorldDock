import { expect, test } from "playwright/test";

test("authenticated creator creates a cloud world and saves an asset through APIs", async ({ page }) => {
  const worlds: any[] = [];
  const assets: any[] = [];
  const createdWorldRequests: any[] = [];
  const createdAssetRequests: any[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_cloud_crud");
  });

  await page.route("**/v1/worlds", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds }) });
      return;
    }
    const input = route.request().postDataJSON();
    createdWorldRequests.push(input);
    const world = {
      id: "world_cloud_1",
      name: input.name,
      type: input.type,
      tags: input.tags,
      summary: input.summary,
      maturity: 8,
      status: "draft",
      visibility: "private",
      archive: 0,
      seeds: 0,
      conflicts: 0,
      updated: new Date().toISOString(),
      mode: "cloud",
    };
    worlds.unshift(world);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ world }) });
  });

  await page.route("**/v1/worlds/world_cloud_1/agent-runs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ run: { id: "run_cloud_1" }, suggestions: [] }),
    });
  });
  await page.route("**/v1/agent-runs/run_cloud_1/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: message.delta",
        'data: {"type":"message.delta","payload":{"text":"可保存设定已生成。"}}',
        "",
        "event: suggestion.created",
        'data: {"type":"suggestion.created","payload":{"suggestion":{"id":"s1","kind":"setting","category":"世界规则","title":"《记忆交易法》","summary":"认证机构可以托管、估价并转让记忆。","body":"所有记忆交易都必须由认证机构托管。","relations":[]}}}',
        "",
        "event: run.completed",
        'data: {"type":"run.completed","payload":{"tokenUsage":{"inputTokens":12,"outputTokens":30,"totalTokens":42}}}',
        "",
      ].join("\n"),
    });
  });
  await page.route("**/v1/worlds/world_cloud_1/archive", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ archiveEntries: [] }) });
  });
  await page.route("**/v1/worlds/world_cloud_1/seeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ storySeeds: [] }) });
  });
  await page.route("**/v1/worlds/world_cloud_1/conflicts", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ conflicts: [] }) });
  });
  await page.route("**/v1/worlds/world_cloud_1/assets", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets, nextCursor: null }) });
      return;
    }
    const input = route.request().postDataJSON();
    createdAssetRequests.push(input);
    const asset = {
      id: "asset_1",
      worldId: "world_cloud_1",
      kind: input.kind,
      title: input.title,
      category: input.category,
      summary: input.summary,
      body: input.body,
      payload: input.payload ?? {},
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assets.unshift(asset);
    worlds[0].archive = 1;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ asset }) });
  });

  await page.goto("/app");
  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await expect.poll(() => createdWorldRequests.length).toBe(1);
  await expect(page.getByText("可保存设定", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "保存 《记忆交易法》" }).click();

  await expect.poll(() => createdAssetRequests.length).toBe(1);
  expect(createdAssetRequests[0]).toMatchObject({
    kind: "setting",
    title: "《记忆交易法》",
  });

  await page.reload();
  await expect(page.getByText("回忆所")).toBeVisible();
});
