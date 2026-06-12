import { expect, test } from "playwright/test";

test("authenticated creator creates a cloud world and saves an asset through APIs", async ({ page }) => {
  const worlds: any[] = [];
  const assets: any[] = [];
  const assetRelations: Array<{ sourceAssetId: string; targetAssetId: string }> = [];
  const createdWorldRequests: any[] = [];
  const createdAssetRequests: any[] = [];
  const savedSuggestionRequests: string[] = [];
  const deletedWorldRequests: string[] = [];
  const duplicatedWorldRequests: string[] = [];
  const updatedAssetRequests: any[] = [];
  const deletedAssetRequests: string[] = [];
  const reorderRequests: string[][] = [];
  const relationRequests: any[] = [];
  const relationDeleteRequests: any[] = [];
  let nextAssetIndex = 1;

  const fulfillMethodNotAllowed = (route: any) => route.fulfill({
    status: 405,
    contentType: "application/json",
    body: JSON.stringify({ code: "METHOD_NOT_ALLOWED" }),
  });

  const syncWorldCounts = () => {
    const world = worlds.find((item) => item.id === "world_cloud_1");
    if (!world) return;
    world.archive = assets.filter((asset) => asset.kind === "setting").length;
    world.seeds = assets.filter((asset) => asset.kind === "seed").length;
    world.conflicts = assets.filter((asset) => asset.kind === "conflict").length;
  };

  const makeAsset = (input: any) => ({
    id: `asset_${nextAssetIndex++}`,
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
  });

  const storeAssets = (...newAssets: any[]) => {
    assets.unshift(...newAssets);
    assets.forEach((item, position) => { item.position = position; });
    syncWorldCounts();
  };

  const withPersistedRelations = () => assets.map((asset) => {
    const relationTargets = assetRelations
      .filter((relation) => relation.sourceAssetId === asset.id)
      .map((relation) => ({
        targetAssetId: relation.targetAssetId,
        label: assets.find((target) => target.id === relation.targetAssetId)?.title ?? relation.targetAssetId,
      }))
      .filter(Boolean);
    if (relationTargets.length === 0) return asset;

    return {
      ...asset,
      payload: {
        ...(asset.payload ?? {}),
        relationLabels: relationTargets.map((relation) => relation.label),
        relationTargets,
      },
    };
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_cloud_crud");
  });

  await page.route("**/v1/world-drafts", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        draft: {
          suggestedName: input.name || "回忆所",
          suggestedType: input.type || "近未来 / 软科幻 / 社会派",
          styles: input.styleKw ? String(input.styleKw).split(/\s+/).filter(Boolean) : ["冷静观察", "制度细节", "道德灰度"],
          coreSetting: "在一个允许记忆作为资产交易的近未来社会，个人最私密的体验成为了可估值、可转让、可继承的财产。",
          coreConflict: "记忆是不可让渡的人格延伸，还是可以定价的私有财产？",
          directions: [
            "深入《记忆交易法》的制度细节与监管漏洞",
            "聚焦黑市与「完整人生」打包交易",
            "探讨记忆植入后宿主的身份连续性",
          ],
          firstQuestion: "你倾向于让记忆交易是成熟合法市场，还是刚被立法承认、仍在制造伦理震荡的新行业？",
          tools: [
            { id: "ctx", label: "分析灵感主题", detail: "提取核心概念、类型线索与世界运行规则" },
            { id: "model", label: "调用真实 Agent", detail: "用当前模型生成名称、设定、矛盾与追问" },
            { id: "shape", label: "整理世界雏形", detail: "收束为可确认的创建草稿" },
          ],
        },
        tokenUsage: { inputTokens: 120, outputTokens: 260, totalTokens: 380 },
      }),
    });
  });

  await page.route("**/v1/worlds", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds }) });
      return;
    }
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
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

  await page.route("**/v1/worlds/world_cloud_1", async (route) => {
    if (route.request().method() === "DELETE") {
      deletedWorldRequests.push("world_cloud_1");
      const world = worlds.find((item) => item.id === "world_cloud_1");
      if (world) world.deletedAt = new Date().toISOString();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ world }) });
      return;
    }
    await fulfillMethodNotAllowed(route);
  });

  await page.route("**/v1/worlds/world_cloud_1/duplicate", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    duplicatedWorldRequests.push("world_cloud_1");
    const world = { ...worlds[0], id: "world_cloud_2", name: `${worlds[0].name} · 副本`, archive: assets.length };
    worlds.unshift(world);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ world }) });
  });

  await page.route("**/v1/worlds/world_cloud_1/agent-runs", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ run: { id: "run_cloud_1" }, suggestions: [] }),
    });
  });
  await page.route("**/v1/agent-runs/run_cloud_1/events", async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: message.delta",
        'data: {"type":"message.delta","payload":{"text":"可保存设定已生成。"}}',
        "",
        "event: suggestion.created",
        'data: {"type":"suggestion.created","payload":{"suggestionId":"ags_1","suggestion":{"id":"s1","kind":"setting","category":"世界规则","title":"《记忆交易法》","summary":"认证机构可以托管、估价并转让记忆。","body":"所有记忆交易都必须由认证机构托管。","relations":[]}}}',
        "",
        "event: run.completed",
        'data: {"type":"run.completed","payload":{"tokenUsage":{"inputTokens":12,"outputTokens":30,"totalTokens":42}}}',
        "",
      ].join("\n"),
    });
  });
  await page.route("**/v1/worlds/world_cloud_1/archive", async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ archiveEntries: [] }) });
  });
  await page.route("**/v1/worlds/world_cloud_1/seeds", async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ storySeeds: [] }) });
  });
  await page.route("**/v1/worlds/world_cloud_1/conflicts", async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ conflicts: [] }) });
  });
  await page.route("**/v1/agent-suggestions/*/save", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const pathSegments = new URL(route.request().url()).pathname.split("/");
    const suggestionId = pathSegments[pathSegments.length - 2];
    savedSuggestionRequests.push(suggestionId);
    const savedAsset = makeAsset({
      kind: "setting",
      title: "《记忆交易法》",
      category: "世界规则",
      summary: "认证机构可以托管、估价并转让记忆。",
      body: "所有记忆交易都必须由认证机构托管。",
      payload: { relations: [] },
    });
    const unrelatedAsset = makeAsset({
      kind: "setting",
      title: "城市语",
      category: "现象",
      summary: "城市通过路牌、钟声和站台广播表达情绪。",
      body: "城市语是一套由基础设施共同组成的半自动表达系统。",
      payload: { relations: [] },
    });
    storeAssets(savedAsset, unrelatedAsset);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ suggestion: { id: suggestionId, status: "saved", savedAssetId: savedAsset.id } }),
    });
  });
  await page.route("**/v1/worlds/world_cloud_1/assets", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets: withPersistedRelations(), nextCursor: null }) });
      return;
    }
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const input = route.request().postDataJSON();
    createdAssetRequests.push(input);
    const asset = makeAsset(input);
    storeAssets(asset);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ asset }) });
  });

  await page.route(/\/v1\/worlds\/world_cloud_1\/assets\/asset_[^/]+$/, async (route) => {
    const assetId = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      updatedAssetRequests.push(input);
      const index = assets.findIndex((asset) => asset.id === assetId);
      if (index < 0) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND" }) });
        return;
      }
      assets[index] = { ...assets[index], ...input, updatedAt: new Date().toISOString() };
      syncWorldCounts();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ asset: assets[index] }) });
      return;
    }
    if (route.request().method() === "DELETE") {
      deletedAssetRequests.push(assetId ?? "");
      const index = assets.findIndex((asset) => asset.id === assetId);
      if (index >= 0) assets.splice(index, 1);
      for (let index = assetRelations.length - 1; index >= 0; index -= 1) {
        const relation = assetRelations[index];
        if (relation.sourceAssetId === assetId || relation.targetAssetId === assetId) assetRelations.splice(index, 1);
      }
      assets.forEach((item, position) => { item.position = position; });
      syncWorldCounts();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ asset: { id: assetId } }) });
      return;
    }
    await fulfillMethodNotAllowed(route);
  });

  await page.route("**/v1/worlds/world_cloud_1/assets/reorder", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const assetIds = route.request().postDataJSON().assetIds;
    reorderRequests.push(assetIds);
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const reordered = assetIds.map((assetId: string) => assetsById.get(assetId)).filter(Boolean);
    const untouched = assets.filter((asset) => !assetIds.includes(asset.id));
    assets.splice(0, assets.length, ...reordered, ...untouched);
    assets.forEach((item, position) => { item.position = position; });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets: withPersistedRelations(), nextCursor: null }) });
  });

  await page.route(/\/v1\/worlds\/world_cloud_1\/assets\/asset_[^/]+\/relations$/, async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const input = route.request().postDataJSON();
    relationRequests.push(input);
    const pathSegments = new URL(route.request().url()).pathname.split("/");
    const sourceAssetId = pathSegments[pathSegments.length - 2];
    const source = assets.find((asset) => asset.id === sourceAssetId);
    const target = assets.find((asset) => asset.id === input.targetAssetId);
    if (source && target) {
      const exists = assetRelations.some((relation) =>
        relation.sourceAssetId === sourceAssetId && relation.targetAssetId === input.targetAssetId,
      );
      if (!exists) assetRelations.push({ sourceAssetId, targetAssetId: input.targetAssetId });
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        relation: {
          worldId: "world_cloud_1",
          sourceAssetId,
          targetAssetId: input.targetAssetId,
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route(/\/v1\/worlds\/world_cloud_1\/assets\/asset_[^/]+\/relations\/asset_[^/]+$/, async (route) => {
    if (route.request().method() !== "DELETE") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    const pathSegments = new URL(route.request().url()).pathname.split("/");
    const targetAssetId = pathSegments[pathSegments.length - 1];
    const sourceAssetId = pathSegments[pathSegments.length - 3];
    relationDeleteRequests.push({ sourceAssetId, targetAssetId });
    const index = assetRelations.findIndex((relation) =>
      relation.sourceAssetId === sourceAssetId && relation.targetAssetId === targetAssetId,
    );
    if (index >= 0) assetRelations.splice(index, 1);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ relation: { worldId: "world_cloud_1", sourceAssetId, targetAssetId } }),
    });
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

  await expect.poll(() => savedSuggestionRequests.length).toBe(1);
  expect(savedSuggestionRequests).toEqual(["ags_1"]);
  expect(createdAssetRequests).toHaveLength(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await expect(page.getByText("回忆所", { exact: true })).toBeVisible();
  await page.getByText("回忆所", { exact: true }).click();
  await page.getByRole("button", { name: "档案" }).click();
  await expect(page.getByRole("heading", { name: "世界档案" })).toBeVisible();
  await expect(page.getByText("《记忆交易法》", { exact: true })).toBeVisible();
  await expect(page.getByText("城市语", { exact: true })).toBeVisible();

  await page.getByPlaceholder("搜索档案…").fill("交易法");
  await expect(page.getByText("《记忆交易法》", { exact: true })).toBeVisible();
  await expect(page.getByText("城市语", { exact: true })).toBeHidden();
  await page.getByPlaceholder("搜索档案…").fill("");
  await expect(page.getByText("城市语", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /新建设定/ }).click();
  const newAssetDialog = page.getByRole("dialog", { name: "新建资产" });
  await expect(newAssetDialog).toBeVisible();
  await newAssetDialog.getByLabel("标题").fill("记忆托管机构");
  await newAssetDialog.getByLabel("摘要").fill("认证机构托管记忆资产。");
  await newAssetDialog.getByLabel("正文").fill("机构需要接受独立审计。");
  await newAssetDialog.getByRole("button", { name: /保存资产/ }).click();
  await expect.poll(() => createdAssetRequests.length).toBe(1);
  expect(createdAssetRequests[0]).toMatchObject({
    kind: "setting",
    title: "记忆托管机构",
  });
  await expect(page.getByText("记忆托管机构", { exact: true })).toBeVisible();

  await page.getByLabel("编辑 记忆托管机构").click();
  const editAssetDialog = page.getByRole("dialog", { name: "编辑资产" });
  await expect(editAssetDialog).toBeVisible();
  await editAssetDialog.getByLabel("摘要").fill("认证机构托管并审计记忆资产。");
  await editAssetDialog.getByRole("button", { name: /保存资产/ }).click();
  await expect.poll(() => updatedAssetRequests.length).toBe(1);
  expect(updatedAssetRequests[0]).toMatchObject({ summary: "认证机构托管并审计记忆资产。" });
  await expect(page.getByText("认证机构托管并审计记忆资产。")).toBeVisible();

  await page.getByLabel("关联 《记忆交易法》").click();
  const relationDialog = page.getByRole("dialog", { name: "关联资产" });
  await expect(relationDialog).toBeVisible();
  await relationDialog.getByRole("button", { name: /记忆托管机构/ }).click();
  await expect.poll(() => relationRequests.length).toBe(1);
  expect(relationRequests[0]).toMatchObject({ targetAssetId: "asset_3" });
  await expect(page.getByText("↳ 记忆托管机构")).toBeVisible();

  await page.getByLabel("关联 《记忆交易法》").click();
  await expect(relationDialog.getByRole("button", { name: "解除关联 记忆托管机构" })).toBeVisible();
  await relationDialog.getByRole("button", { name: "解除关联 记忆托管机构" }).click();
  await expect.poll(() => relationDeleteRequests.length).toBe(1);
  expect(relationDeleteRequests[0]).toEqual({ sourceAssetId: "asset_1", targetAssetId: "asset_3" });
  await expect(page.locator(".tag", { hasText: "↳ 记忆托管机构" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(relationDialog).toBeHidden();

  await page.getByLabel("上移 《记忆交易法》").click();
  await expect.poll(() => reorderRequests.length).toBe(1);
  expect(reorderRequests[0]).toEqual(["asset_1", "asset_3", "asset_2"]);

  await page.getByLabel("删除 记忆托管机构").click();
  await expect.poll(() => deletedAssetRequests.length).toBe(1);
  expect(deletedAssetRequests).toContain("asset_3");
  await expect(page.getByText("记忆托管机构", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  const originalWorldCard = page.locator(".card").filter({ has: page.getByText("回忆所", { exact: true }) });
  await expect(originalWorldCard).toHaveCount(1);
  await originalWorldCard.getByTitle("更多").click();
  await page.getByRole("button", { name: "复制为新世界" }).click();
  await expect.poll(() => duplicatedWorldRequests.length).toBe(1);
  const duplicatedWorldCard = page.locator(".card").filter({ has: page.getByText("回忆所 · 副本", { exact: true }) });
  await expect(duplicatedWorldCard).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await originalWorldCard.getByTitle("更多").click();
  await page.getByRole("button", { name: "删除世界" }).click();
  await expect.poll(() => deletedWorldRequests.length).toBe(1);
  expect(deletedWorldRequests).toEqual(["world_cloud_1"]);
});
