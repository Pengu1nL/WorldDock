import { expect, test, type Page, type Route } from "playwright/test";
import { installApiMocks } from "./helpers";

test("creator can create a world, continue a run, and save suggestions", async ({ page }) => {
  await installApiMocks(page);
  const sessionMocks = await installSessionMocks(page);
  await page.goto("/app");
  await page.getByRole("heading", { name: "我的世界" }).waitFor();

  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await expect(page.getByRole("button", { name: /潜在资产/ })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("继续推演").fill("检查亲属记忆交易的制度漏洞。");
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.getByText("亲属记忆交易需要冷静期复核。")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /潜在资产/ }).click();
  await expect(page.getByText("记忆交易许可")).toBeVisible();
  await page.getByRole("button", { name: "沉淀" }).click();
  await expect.poll(() => sessionMocks.wasPromoted()).toBe(true);
  await expect(page.getByText("已沉淀", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "沉淀" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /资产库/ }).click();
  await expect(page.locator("main").getByText("《记忆交易法》", { exact: true })).toBeVisible();
});

async function installSessionMocks(page: Page) {
  let sessionRunCompleted = false;
  let promoted = false;

  await page.route("**/v1/worlds/world_created/agent-sessions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/v1/worlds/world_created/agent-sessions") {
      return json(route, { sessions: [session], nextCursor: null });
    }

    if (method === "GET" && path === "/v1/worlds/world_created/agent-sessions/session_e2e") {
      return json(route, buildSessionDetail(sessionRunCompleted));
    }

    if (method === "GET" && path === "/v1/worlds/world_created/agent-sessions/session_e2e/potential-assets") {
      return json(route, { potentialAssets: [buildPotentialAsset(promoted)], nextCursor: null });
    }

    if (method === "POST" && path === "/v1/worlds/world_created/agent-sessions/session_e2e/runs") {
      return json(route, { run: { id: "session_run_e2e" } }, 201);
    }

    return route.fallback();
  });

  await page.route("**/v1/agent-session-runs/session_run_e2e/events", async (route) => {
    sessionRunCompleted = true;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        sessionSse(1, "message.delta", { text: "亲属记忆交易需要冷静期复核。" }),
        sessionSse(2, "potential_asset.detected", {
          potentialAssetId: "pa_1",
          potentialAsset: buildPotentialAsset(promoted),
        }),
        sessionSse(3, "run.completed", {
          tokenUsage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
        }),
      ].join(""),
    });
  });

  await page.route("**/v1/worlds/world_created/official-assets", async (route) => {
    return json(route, {
      assets: promoted ? [memoryTradeLawOfficialAsset] : [],
      nextCursor: null,
    });
  });

  await page.route("**/v1/worlds/world_created/potential-assets/pa_1/promote", async (route) => {
    promoted = true;
    return json(route, {
      asset: {
        id: "archive_1",
        title: "《记忆交易法》",
      },
      potentialAsset: buildPotentialAsset(promoted),
      depositionRun: { id: "deposition_run_e2e" },
    }, 201);
  });

  return {
    wasPromoted: () => promoted,
  };
}

const session = {
  id: "session_e2e",
  worldId: "world_created",
  kind: "world_exploration",
  title: "回忆所 推演",
  status: "active",
  current: true,
  subjects: [],
  contextItems: [],
  metadata: {},
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};

function buildSessionDetail(sessionRunCompleted: boolean) {
  return {
    session,
    subjects: [],
    contextItems: [],
    messages: sessionRunCompleted
      ? [
        {
          id: "msg_session_e2e_assistant",
          sessionId: "session_e2e",
          role: "assistant",
          content: "亲属记忆交易需要冷静期复核。",
          status: "complete",
          metadata: {},
          createdAt: "2026-05-28T10:00:03.000Z",
        },
      ]
      : [],
  };
}

function buildPotentialAsset(promoted: boolean) {
  return {
    id: "pa_1",
    worldId: "world_created",
    sessionId: "session_e2e",
    type: "rule",
    title: "记忆交易许可",
    summary: "需要登记。",
    evidence: [],
    status: promoted ? "promoted" : "active",
    promotedAssetId: promoted ? "archive_1" : null,
    createdAt: "2026-05-28T10:00:00.000Z",
    updatedAt: promoted ? "2026-05-28T10:00:04.000Z" : "2026-05-28T10:00:00.000Z",
  };
}

const memoryTradeLawOfficialAsset = {
  id: "official_asset_1",
  worldId: "world_created",
  type: "rule",
  name: "《记忆交易法》",
  summary: "认证机构可以托管、估价并转让记忆，但亲属记忆交易必须经过冷静期。",
  documentKey: "rules/memory-trade-law.md",
  status: "active",
  version: 1,
  tags: ["法律"],
  metadata: {},
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
  archivedAt: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function sessionSse(sequence: number, type: string, payload: unknown) {
  return [
    `event: ${type}`,
    `data: ${JSON.stringify({
      id: `evt_session_run_e2e_${sequence}`,
      runId: "session_run_e2e",
      sequence,
      createdAt: `2026-05-28T10:00:0${sequence}.000Z`,
      type,
      payload,
    })}`,
    "",
    "",
  ].join("\n");
}
