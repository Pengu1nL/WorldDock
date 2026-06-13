import type { Page, Route } from "playwright/test";

const tideWorld = {
  id: "tide",
  name: "潮汐之书",
  type: "海洋奇幻 · 制度史诗",
  tags: ["海洋", "宗教", "制度"],
  summary: "潮汐每 13 年一次反向，整个文明的法律、婚姻与税收都建立在这个循环之上。",
  maturity: 72,
  status: "draft",
  visibility: "private",
  archive: 47,
  seeds: 12,
  conflicts: 6,
  updated: "3 小时前",
  mode: "local",
  hasUnpushed: false,
};

const ledgerWorld = {
  id: "ledger",
  name: "账簿世界",
  type: "蒸汽朋克 · 经济推演",
  tags: ["货币", "蒸汽", "审计"],
  summary: "所有人际关系都必须以双式记账法记录，未入账的承诺在法律上不存在。",
  maturity: 54,
  status: "draft",
  visibility: "private",
  archive: 31,
  seeds: 8,
  conflicts: 4,
  updated: "昨天",
  mode: "local",
  hasUnsaved: true,
};

const memoryTradeLawAsset = {
  id: "archive_1",
  worldId: "world_created",
  kind: "setting",
  title: "《记忆交易法》",
  category: "世界规则",
  summary: "认证机构可以托管、估价并转让记忆，但亲属记忆交易必须经过冷静期。",
  body: "所有记忆交易都必须由认证机构托管，亲属关系内的交易需要七日冷静期和独立见证。",
  payload: { relations: [] },
  position: 0,
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};

const tideLawAsset = {
  id: "tide_law",
  worldId: "tide",
  kind: "setting",
  title: "潮汐律",
  category: "世界规则",
  summary: "潮汐律定义文明周期。",
  body: "潮汐每 13 年一次反向，税制与航线许可随之切换。",
  payload: { relations: [] },
  position: 0,
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};

const tideSecretAsset = {
  id: "tide_secret",
  worldId: "tide",
  kind: "setting",
  title: "临时调试残留",
  category: "世界规则",
  summary: "发布前需要确认的调试片段。",
  body: "临时调试 Authorization: Bearer sk-e2e-secret-should-not-render",
  payload: { relations: [] },
  position: 1,
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};

type ApiMockOptions = {
  onPushWorld?: (push: { worldId: string; input: Record<string, any> }) => void;
};

export async function gotoApp(page: Page, options: { installMocks?: boolean; mockOptions?: ApiMockOptions } = {}) {
  if (options.installMocks ?? true) {
    await installApiMocks(page, options.mockOptions);
  }
  await page.goto("/app");
  await page.getByRole("heading", { name: "我的世界" }).waitFor();
}

export async function installApiMocks(page: Page, options: ApiMockOptions = {}) {
  let hubConnection: { hubUrl: string; tokenPrefix: string } | null = {
    hubUrl: "https://hub.worlddock.test",
    tokenPrefix: "wdpat_e2",
  };

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/v1/worlds") {
      return json(route, { worlds: [tideWorld, ledgerWorld] });
    }

    if (method === "GET" && path === "/v1/connections/hub") {
      return json(route, { connection: hubConnection });
    }

    if (method === "PUT" && path === "/v1/connections/hub") {
      const input = postData(request);
      hubConnection = {
        hubUrl: String(input.hubUrl ?? "https://hub.worlddock.test").replace(/\/+$/, ""),
        tokenPrefix: String(input.token ?? "wdpat_mock").slice(0, 8),
      };
      return json(route, { connection: hubConnection });
    }

    if (method === "DELETE" && path === "/v1/connections/hub") {
      hubConnection = null;
      return json(route, { connection: null });
    }

    if (method === "POST" && path === "/v1/connections/hub/test") {
      return hubConnection
        ? json(route, { ok: true })
        : json(route, { message: "Hub connection is not configured." }, 404);
    }

    if (method === "POST" && path === "/v1/worlds") {
      const input = postData(request);
      return json(route, {
        world: {
          id: "world_created",
          name: input.name || "记忆可以买卖",
          type: input.type || "未分类世界",
          tags: input.tags || ["记忆"],
          summary: input.summary || "一个世界里，记忆可以被买卖。",
          maturity: 8,
          status: "draft",
          visibility: "private",
          archive: 0,
          seeds: 0,
          conflicts: 0,
          updated: "刚刚",
          mode: "local",
          hasUnsaved: true,
        },
      }, 201);
    }

    if (method === "POST" && path === "/v1/world-drafts") {
      const input = postData(request);
      return json(route, {
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
      }, 201);
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/assets$/.test(path)) {
      const worldId = path.split("/")[3];
      if (worldId === "tide") {
        return json(route, {
          assets: [tideLawAsset, tideSecretAsset],
          nextCursor: null,
        });
      }
      return json(route, {
        assets: worldId === "world_created" ? [memoryTradeLawAsset] : [],
        nextCursor: null,
      });
    }

    if (method === "POST" && /\/v1\/worlds\/[^/]+\/push$/.test(path)) {
      const worldId = path.split("/")[3];
      const input = postData(request);
      options.onPushWorld?.({ worldId, input });
      return json(route, {
        repository: { owner: input.owner, slug: input.slug },
        release: {
          id: "rel_e2e",
          version: "0.1.0",
          url: `https://hub.worlddock.test/${input.owner}/${input.slug}/releases/rel_e2e`,
        },
      }, 201);
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/archive$/.test(path)) {
      const worldId = path.split("/")[3];
      const archiveEntries = worldId === "tide" || worldId === "ledger"
        ? [{ id: "archive_1", title: "潮汐律", category: "世界规则", summary: "已确认设定。", body: "潮汐律定义文明周期。", relations: [] }]
        : [];
      return json(route, { archiveEntries });
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/seeds$/.test(path)) {
      return json(route, { storySeeds: [] });
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/conflicts$/.test(path)) {
      return json(route, { conflicts: [] });
    }

    if (method === "POST" && /\/v1\/worlds\/[^/]+\/agent-runs$/.test(path)) {
      return json(route, { run: { id: "run_e2e" }, suggestions: [] });
    }

    if (method === "GET" && path === "/v1/agent-runs/run_e2e/events") {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          agentSse(1, "run.started", { runId: "run_e2e", mode: "expand" }),
          agentSse(2, "pi.session.started", { piSessionId: "pi_session_e2e" }),
          agentSse(3, "tool.requested", { toolCall: { id: "call_search_world_assets", name: "search_world_assets", arguments: { query: "记忆交易" } } }),
          agentSse(4, "tool.completed", { toolCallId: "call_search_world_assets", result: { assets: [] } }),
          agentSse(5, "message.delta", { text: "雏形已生成，已整理出一条核心规则。" }),
          agentSse(6, "context.used", {
            contextRef: {
              id: "ctx_world_manifest",
              kind: "world",
              title: "回忆所",
              excerpt: "记忆可以被买卖，但交易必须经过认证机构托管。",
              targetId: "world_created",
              level: "manifest",
              source: "tool",
            },
          }),
          agentSse(7, "context.used", {
            contextRef: {
              id: "ctx_archive_trade_law",
              kind: "archive",
              title: "《记忆交易法》",
              excerpt: "认证机构可以托管、估价并转让记忆。",
              targetId: "asset_memory_trade_law",
              level: "card",
              source: "tool",
            },
          }),
          agentSse(8, "suggestion.created", {
            suggestionId: "ags_1",
            suggestion: {
              id: "s1",
              kind: "setting",
              category: "世界规则",
              title: "《记忆交易法》",
              summary: "认证机构可以托管、估价并转让记忆，但亲属记忆交易必须经过冷静期。",
              body: "所有记忆交易都必须由认证机构托管，亲属关系内的交易需要七日冷静期和独立见证。",
              relations: [],
            },
          }),
          agentSse(9, "run.completed", {
            tokenUsage: { inputTokens: 120, outputTokens: 260, totalTokens: 380 },
          }),
        ].join(""),
      });
    }

    if (method === "POST" && /\/v1\/agent-suggestions\/[^/]+\/save$/.test(path)) {
      return json(route, {
        suggestion: { id: "ags_1", status: "saved", savedAssetId: memoryTradeLawAsset.id },
        asset: memoryTradeLawAsset,
      }, 201);
    }

    if (method === "POST" && /\/v1\/agent-suggestions\/[^/]+\/discard$/.test(path)) {
      return json(route, { suggestion: { id: "ags_1", status: "discarded" } });
    }

    return json(route, { message: `Unhandled mock route: ${method} ${path}` }, 404);
  });
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function agentSse(sequence: number, type: string, payload: unknown) {
  return sse(type, {
    id: `evt_run_e2e_${sequence}`,
    runId: "run_e2e",
    sequence,
    createdAt: `2026-05-28T10:00:0${sequence}.000Z`,
    type,
    payload,
  });
}

function postData(request: ReturnType<Route["request"]>) {
  try {
    return request.postDataJSON() as Record<string, any>;
  } catch {
    return {};
  }
}
