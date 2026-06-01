import type { Page, Route } from "playwright/test";

const sessionToken = "session_valid";

type ApiMockOptions = {
  onAnalyticsEvent?: (event: Record<string, any>) => void;
};

const tideWorld = {
  id: "tide",
  name: "潮汐之书",
  type: "海洋奇幻 · 制度史诗",
  tags: ["海洋", "宗教", "制度"],
  summary: "潮汐每 13 年一次反向，整个文明的法律、婚姻与税收都建立在这个循环之上。",
  maturity: 72,
  status: "published",
  visibility: "public",
  archive: 47,
  seeds: 12,
  conflicts: 6,
  updated: "3 小时前",
  starred: 184,
  forked: 23,
  mode: "cloud",
  hasUnpushed: false,
};

const ledgerWorld = {
  id: "ledger",
  name: "账簿世界",
  type: "蒸汽朋克 · 经济推演",
  tags: ["货币", "蒸汽", "审计"],
  summary: "所有人际关系都必须以双式记账法记录，未入账的承诺在法律上不存在。",
  maturity: 54,
  status: "unpublished",
  visibility: "private",
  archive: 31,
  seeds: 8,
  conflicts: 4,
  updated: "昨天",
  mode: "cloud",
  hasUnsaved: true,
};

const tideRepository = {
  id: "repo_tide",
  owner: "ren",
  slug: "tide-book",
  name: "潮汐之书",
  summary: "潮汐每 13 年一次反向，文明的法律、婚姻与税收都建立在这个循环之上。",
  readme: "一个把自然周期写进制度深处的海洋奇幻世界。",
  tags: ["海洋", "宗教", "制度"],
  stars: 184,
  forks: 23,
  seeds: 12,
  maturity: 72,
  updated: "3 小时前",
  version: "v1.2.0",
  visibility: "public",
  license: "free-fork-attribution",
  moderationStatus: "visible",
  moderationReason: null,
  releases: [
    {
      version: "v1.2.0",
      updated: "3 小时前",
      note: "新增潮税制度与两条高潜力故事种子。",
      addedSettings: 6,
      changedSettings: 2,
      removedSettings: 0,
      addedSeeds: 2,
      source: "cloud-publish",
    },
  ],
};

export async function gotoApp(page: Page, options: { installMocks?: boolean; onAnalyticsEvent?: (event: Record<string, any>) => void } = {}) {
  if (options.installMocks ?? true) {
    await installApiMocks(page, { onAnalyticsEvent: options.onAnalyticsEvent });
    await page.addInitScript((token) => {
      window.localStorage.setItem("worlddock.sessionToken", token);
    }, sessionToken);
  }
  await page.goto("/app");
  await page.getByRole("heading", { name: "我的世界" }).waitFor();
}

async function installApiMocks(page: Page, options: ApiMockOptions = {}) {
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/v1/worlds") {
      return json(route, { worlds: [tideWorld, ledgerWorld] });
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
          mode: "cloud",
          hasUnsaved: true,
        },
      });
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/archive$/.test(path)) {
      const worldId = path.split("/")[3];
      const archiveEntries = worldId === "tide" || worldId === "ledger"
        ? [{ id: "archive_1", title: "潮汐律", category: "世界规则", summary: "公开发布所需的已确认设定。", body: "潮汐律定义文明周期。", relations: [] }]
        : [];
      return json(route, { archiveEntries });
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/seeds$/.test(path)) {
      return json(route, { storySeeds: [] });
    }

    if (method === "GET" && /\/v1\/worlds\/[^/]+\/conflicts$/.test(path)) {
      return json(route, { conflicts: [] });
    }

    if (method === "POST" && /\/v1\/worlds\/[^/]+\/releases\/preview$/.test(path)) {
      return json(route, {
        preflight: {
          ok: true,
          checks: [
            { code: "assets", ok: true, message: "至少保存一个世界资产" },
            { code: "license", ok: true, message: "已选择授权方式" },
            { code: "release_note", ok: true, message: "已填写发布说明" },
            { code: "moderation", ok: true, message: "发布前预扫描通过" },
            { code: "entitlement", ok: true, message: "账户包含公开发布权益" },
          ],
          changes: [
            { assetId: "archive:archive_1", kind: "added", title: "潮汐律", afterHash: "hash_1" },
          ],
        },
      }, 201);
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
      return json(route, { suggestion: { id: "ags_1", status: "saved" } });
    }

    if (method === "POST" && /\/v1\/agent-suggestions\/[^/]+\/discard$/.test(path)) {
      return json(route, { suggestion: { id: "ags_1", status: "discarded" } });
    }

    if (method === "POST" && /\/v1\/worlds\/[^/]+\/publish$/.test(path)) {
      return json(route, {
        repository: tideRepository,
        release: {
          id: "release_tide_1",
          repositoryId: tideRepository.id,
          version: "v1.2.1",
          note: "补齐公开仓库的首个快照。",
          license: "free-fork-attribution",
          diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 0 },
          createdAt: "2026-05-28T10:00:00.000Z",
        },
      });
    }

    if (method === "GET" && path === "/v1/repositories") {
      return json(route, { repositories: [tideRepository] });
    }

    if (method === "GET" && path === "/v1/community/repositories") {
      return json(route, { repositories: [toCommunityRepository(tideRepository)], nextCursor: null });
    }

    if (method === "GET" && path === "/v1/community/repositories/ren/tide-book") {
      return json(route, { repository: toCommunityRepository(tideRepository) });
    }

    if (method === "GET" && path === "/v1/community/repositories/repo_tide/assets") {
      return json(route, {
        repositoryId: "repo_tide",
        releaseId: "release_tide_1",
        assets: [],
        nextCursor: null,
      });
    }

    if (method === "GET" && path === "/v1/community/creators/ren") {
      return json(route, {
        creator: {
          handle: "ren",
          displayName: "ren",
          bio: "Alpha 创作者主页",
          stats: { repositories: 1, stars: tideRepository.stars, forks: tideRepository.forks },
          tags: tideRepository.tags,
          latestUpdated: tideRepository.updated,
        },
      });
    }

    if (method === "GET" && path === "/v1/community/creators/ren/repositories") {
      return json(route, { repositories: [toCommunityRepository(tideRepository)], nextCursor: null });
    }

    if (method === "POST" && path === "/v1/community/repositories/repo_tide/collections") {
      return json(route, {
        collection: {
          id: "collection_1",
          repositoryId: "repo_tide",
          userId: "user_1",
          name: "saved",
          createdAt: "2026-05-28T10:00:00.000Z",
        },
      });
    }

    if (method === "GET" && path === "/v1/repositories/search") {
      return json(route, { repositories: [tideRepository] });
    }

    if (method === "POST" && path === "/v1/repositories/repo_tide/star") {
      return json(route, { repository: { ...tideRepository, stars: tideRepository.stars + 1 } });
    }

    if (method === "DELETE" && path === "/v1/repositories/repo_tide/star") {
      return json(route, { repository: tideRepository });
    }

    if (method === "POST" && path === "/v1/repositories/repo_tide/fork") {
      return json(route, {
        world: {
          ...tideWorld,
          id: "fork_tide",
          name: "潮汐之书 · Fork",
          status: "draft",
          visibility: "private",
          updated: "刚刚",
          hasUnsaved: false,
        },
        fork: { id: "fork_1" },
      });
    }

    if (method === "POST" && path === "/v1/repositories/repo_tide/reports") {
      return json(route, { report: { id: "report_1" } });
    }

    if (method === "GET" && path === "/v1/billing/balance") {
      return json(route, {
        balance: { userId: "user_1", currency: "CNY", balanceCents: 9950, lowBalanceThresholdCents: 500, updatedAt: "刚刚" },
      });
    }

    if (method === "GET" && path === "/v1/billing/usage") {
      return json(route, {
        usage: {
          balance: { userId: "user_1", currency: "CNY", balanceCents: 9950, lowBalanceThresholdCents: 500, updatedAt: "刚刚" },
          lastAgentRun: {
            agentRunId: "run_e2e",
            tokenUsage: { inputTokens: 120, outputTokens: 260, totalTokens: 380 },
            costCents: 42,
            createdAt: "2026-05-28T10:00:00.000Z",
          },
          entries: [
            {
              id: "ledger_1",
              accountId: "account_1",
              userId: "user_1",
              agentRunId: "run_e2e",
              type: "agent_run",
              amountCents: -42,
              tokenUsage: { inputTokens: 120, outputTokens: 260, totalTokens: 380 },
              reason: "e2e agent run",
              createdAt: "2026-05-28T10:00:00.000Z",
            },
          ],
        },
      });
    }

    if (method === "GET" && path === "/v1/access-tokens") {
      return json(route, { accessTokens: [] });
    }

    if (method === "POST" && path === "/v1/access-tokens") {
      return json(route, {
        token: "wd_mock_token",
        accessToken: {
          id: "at_1",
          name: "Local Push",
          prefix: "wd_mock",
          scopes: ["world:read", "world:write", "repository:push"],
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: "2026-05-28T10:00:00.000Z",
        },
      });
    }

    if (method === "POST" && path === "/v1/support/feedback") {
      const input = postData(request);
      return json(route, {
        feedback: {
          id: "feedback_e2e",
          userId: "user_1",
          message: input.message,
          context: input.context ?? {},
          status: "open",
          createdAt: "2026-06-01T10:00:00.000Z",
        },
        notification: {
          id: "notification_feedback_e2e",
          userId: "user_1",
          type: "support_feedback_submitted",
          title: "反馈已收到",
          body: input.message,
          readAt: null,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      }, 201);
    }

    if (method === "POST" && path === "/v1/analytics/events") {
      const input = postData(request);
      options.onAnalyticsEvent?.(input);
      return json(route, {
        event: {
          id: "event_e2e",
          ...input,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      }, 201);
    }

    if (method === "DELETE" && /\/v1\/access-tokens\/[^/]+$/.test(path)) {
      return json(route, {
        accessToken: {
          id: "at_1",
          name: "Local Push",
          prefix: "wd_mock",
          scopes: ["world:read", "world:write", "repository:push"],
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: "2026-05-28T10:00:00.000Z",
          createdAt: "2026-05-28T10:00:00.000Z",
        },
      });
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

function toCommunityRepository(repository: typeof tideRepository) {
  return {
    ...repository,
    latestRelease: repository.releases[0],
    releaseHistory: repository.releases,
    assetCounts: { archive: 47, seeds: repository.seeds, conflicts: 6 },
    forkGraph: { repositoryId: repository.id, forks: [] },
  };
}

function postData(request: ReturnType<Route["request"]>) {
  try {
    return request.postDataJSON() as Record<string, any>;
  } catch {
    return {};
  }
}
