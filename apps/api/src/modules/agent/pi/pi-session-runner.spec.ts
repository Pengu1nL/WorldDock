import type { PiRuntimeEvent, PiToolCall } from "@worlddock/domain/agent/pi";
import { describe, expect, it } from "vitest";
import type { PiRuntimeClient, PiSessionInput } from "./pi-runtime.client";
import { PiSessionRunner } from "./pi-session-runner";
import { SafetyGate } from "./safety-gate";
import { buildDisclosureBriefs, buildDisclosureCards, createWorldToolRegistry } from "./world-tools";
import { WorldToolRegistry } from "./world-tool-registry";

const BASE_INPUT: PiSessionInput = {
  runId: "run_1",
  worldId: "world_1",
  prompt: "沉淀这个设定",
  context: [],
  policy: { kind: "world_exploration", intent: "asset_deposition" },
  tools: [],
  skills: [],
};

describe("PiSessionRunner", () => {
  it("blocks world-scoped tool calls for a different world before execution", async () => {
    let executed = false;
    const runner = createRunner({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_2", type: "rule", name: "记忆交易许可" },
    }, async () => {
      executed = true;
      return { assetId: "official_asset_1" };
    });

    await expect(collect(runner.run(BASE_INPUT))).rejects.toThrow(/Blocked cross-world pi tool/);
    expect(executed).toBe(false);
  });

  it("executes world-scoped tool calls for the current session world", async () => {
    let executedArguments: Record<string, unknown> | undefined;
    const runner = createRunner({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_1", type: "rule", name: "记忆交易许可" },
    }, async (arguments_) => {
      executedArguments = arguments_;
      return { assetId: "official_asset_1" };
    });

    const events = await collect(runner.run(BASE_INPUT));

    expect(executedArguments).toEqual(expect.objectContaining({ worldId: "world_1" }));
    expect(events).toEqual([{
      type: "tool.completed",
      toolCallId: "tool_1",
      result: { assetId: "official_asset_1" },
    }]);
  });

  it("allows pending suggestion tools without a worldId argument in default exploration", async () => {
    let executed = false;
    const runner = createRunner({
      id: "tool_1",
      name: "propose_setting",
      arguments: {
        title: "记忆交易许可",
        category: "世界规则",
        categoryReason: "主语是交易制度本身。",
        body: "所有记忆交易都需要登记。",
      },
    }, async () => {
      executed = true;
      return { suggestionId: "pending_setting_1" };
    });

    const events = await collect(runner.run({
      ...BASE_INPUT,
      policy: { kind: "world_exploration" },
    }));

    expect(executed).toBe(true);
    expect(events).toEqual([{
      type: "tool.completed",
      toolCallId: "tool_1",
      result: { suggestionId: "pending_setting_1" },
    }]);
  });

  it("searches formal world assets so deposition can detect duplicate names before creation", async () => {
    const timestamp = new Date("2026-06-20T00:00:00.000Z");
    const registry = createWorldToolRegistry(
      {
        listArchiveEntries: async () => [],
        listStorySeeds: async () => [],
        listConflicts: async () => [],
      } as never,
      {
        listAssets: async () => ({
          assets: [{
            id: "official_asset_existing_gravity",
            worldId: "world_1",
            type: "rule",
            name: "重力",
            summary: "已有重力规则。",
            documentKey: "worlds/world_1/official-assets/official_asset_existing_gravity.md",
            status: "active",
            version: 1,
            tags: [],
            metadata: {},
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
          }],
          nextCursor: null,
        }),
      } as never,
    );

    const result = await registry.execute("search_world_assets", {
      worldId: "world_1",
      query: "重力",
    });

    expect(result.cards).toEqual([expect.objectContaining({
      kind: "setting",
      title: "重力",
      excerpt: "已有重力规则。",
      targetId: "official_asset_existing_gravity",
    })]);
  });

  it("includes formal world assets in world manifest disclosures", async () => {
    const timestamp = new Date("2026-06-20T00:00:00.000Z");
    const world = {
      id: "world_1",
      name: "宇宙纪元",
      type: "近未来硬科幻",
      summary: "聚变能源与太空电梯开启宇宙殖民。",
      tags: ["硬科幻"],
      status: "draft",
      visibility: "private",
      mode: "local",
      maturity: 20,
      coverObjectId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    } as const;
    const officialAssets = {
      listAssets: async () => ({
        assets: [{
          id: "official_asset_existing_gravity",
          worldId: "world_1",
          type: "rule",
          name: "重力",
          summary: "已有重力规则。",
          documentKey: "worlds/world_1/official-assets/official_asset_existing_gravity.md",
          status: "active",
          version: 1,
          tags: [],
          metadata: {},
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
        }],
        nextCursor: null,
      }),
    } as never;
    const worlds = {
      findWorldById: async () => world,
      countAssets: async () => ({ archive: 0, seeds: 0, conflicts: 0 }),
      listArchiveEntries: async () => [],
      listStorySeeds: async () => [],
      listConflicts: async () => [],
    } as never;
    const registry = createWorldToolRegistry(worlds, officialAssets);

    const result = await registry.execute("get_world_manifest", { worldId: "world_1" });

    expect(result).toEqual(expect.objectContaining({
      found: true,
      manifest: expect.objectContaining({
        assetCounts: { archive: 0, seeds: 0, conflicts: 0, official: 1, total: 1 },
        recentChanges: ["setting: 重力"],
        index: [expect.objectContaining({
          kind: "setting",
          title: "重力",
          excerpt: "已有重力规则。",
          targetId: "official_asset_existing_gravity",
        })],
      }),
    }));

    await expect(buildDisclosureCards(worlds, "world_1", officialAssets)).resolves.toEqual([
      expect.objectContaining({
        title: "重力",
        targetId: "official_asset_existing_gravity",
      }),
    ]);
    await expect(buildDisclosureBriefs(worlds, "world_1", officialAssets)).resolves.toEqual([
      expect.objectContaining({
        title: "重力",
        summary: "已有重力规则。",
        sourcePointers: ["setting:official_asset_existing_gravity"],
      }),
    ]);
  });

  it("reads formal asset detail by the target id returned from search", async () => {
    const timestamp = new Date("2026-06-20T00:00:00.000Z");
    const asset = {
      id: "official_asset_existing_gravity",
      worldId: "world_1",
      type: "rule",
      name: "重力",
      summary: "已有重力规则。",
      documentKey: "worlds/world_1/official-assets/official_asset_existing_gravity.md",
      status: "active",
      version: 1,
      tags: [],
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    } as const;
    const registry = createWorldToolRegistry(
      {
        listArchiveEntries: async () => [],
        listStorySeeds: async () => [],
        listConflicts: async () => [],
      } as never,
      {
        listAssets: async () => ({
          assets: [asset],
          nextCursor: null,
        }),
        getAsset: async () => ({
          asset,
          markdown: "# 重力\n\n## 概括\n\n已有重力规则全文。",
          indexes: [],
          revisions: [],
        }),
      } as never,
    );

    const search = await registry.execute("search_world_assets", {
      worldId: "world_1",
      query: "重力",
    });
    const targetId = (search.cards as Array<{ targetId: string }>)[0]?.targetId;

    const result = await registry.execute("get_asset_detail", {
      worldId: "world_1",
      assetId: targetId,
    });

    expect(result).toEqual({
      found: true,
      detail: expect.objectContaining({
        kind: "setting",
        title: "重力",
        targetId,
        body: "# 重力\n\n## 概括\n\n已有重力规则全文。",
      }),
    });
  });

  it("normalizes Chinese official asset type labels before creating world assets", async () => {
    let capturedType: unknown;
    const registry = createWorldToolRegistry(
      {} as never,
      {
        createAsset: async (_worldId: string, input: { type: unknown; markdown?: string }) => {
          capturedType = input.type;
          const timestamp = new Date("2026-06-20T00:00:00.000Z");
          return {
            asset: {
              id: "official_asset_1",
              worldId: "world_1",
              type: input.type,
              name: "重力",
              summary: "重力规则。",
              documentKey: "worlds/world_1/official-assets/official_asset_1.md",
              status: "active",
              version: 1,
              tags: [],
              metadata: {},
              createdAt: timestamp,
              updatedAt: timestamp,
              archivedAt: null,
            },
            markdown: input.markdown ?? "",
            indexes: [],
            revisions: [],
          };
        },
      } as never,
    );

    const result = await registry.execute("create_world_asset", {
      worldId: "world_1",
      type: "规则",
      name: "重力",
      summary: "重力规则。",
      markdown: "# 重力\n\n## 概括\n\n重力规则。",
    });

    expect(capturedType).toBe("rule");
    expect(result.asset).toMatchObject({ type: "rule", name: "重力" });
  });

  it("returns a duplicate-name prompt result instead of creating a world asset", async () => {
    let created = false;
    const timestamp = new Date("2026-06-20T00:00:00.000Z");
    const registry = createWorldToolRegistry(
      {} as never,
      {
        createAsset: async () => {
          created = true;
          throw new Error("createAsset should not be called when an asset name already exists.");
        },
        listAssets: async () => ({
          assets: [{
            id: "official_asset_existing_gravity",
            worldId: "world_1",
            type: "rule",
            name: "重力",
            summary: "已有重力规则。",
            documentKey: "worlds/world_1/official-assets/official_asset_existing_gravity.md",
            status: "active",
            version: 1,
            tags: [],
            metadata: {},
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
          }],
          nextCursor: null,
        }),
      } as never,
    );

    const result = await registry.execute("create_world_asset", {
      worldId: "world_1",
      type: "规则",
      name: "重力",
      summary: "重力规则。",
      markdown: "# 重力\n\n## 概括\n\n重力规则。",
    });

    expect(created).toBe(false);
    expect(result).toEqual({
      needsUserDecision: true,
      code: "OFFICIAL_ASSET_NAME_CONFLICT",
      message: "资产库中已经存在名为「重力」的资产。请询问用户：要改用其他名称新建，还是修改当前已经存在的资产？",
      conflict: {
        name: "重力",
        existingAsset: {
          id: "official_asset_existing_gravity",
          name: "重力",
          type: "rule",
          summary: "已有重力规则。",
        },
      },
    });
  });

  it("emits consistency issue created events from create_consistency_issue tool results", async () => {
    const createdIssue = {
      id: "issue_1",
      worldId: "world_1",
      title: "登记口径冲突",
      description: "必须登记与无需登记冲突。",
      involves: ["asset_1"],
      severity: "normal",
      status: "open",
      subjectAssetIds: ["asset_1"],
      evidence: [],
      metadata: {},
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      updatedAt: new Date("2026-06-19T00:00:00.000Z"),
      resolvedAt: null,
    };
    const registry = createWorldToolRegistry(
      {} as never,
      undefined,
      undefined,
      {
        createIssue: async () => createdIssue,
      } as never,
    );
    const runtime: PiRuntimeClient = {
      async *runSession(_input, executeTool): AsyncIterable<PiRuntimeEvent> {
        if (!executeTool) throw new Error("Expected tool executor.");
        const toolCall: PiToolCall = {
          id: "tool_issue_1",
          name: "create_consistency_issue",
          arguments: {
            worldId: "world_1",
            title: "登记口径冲突",
            description: "必须登记与无需登记冲突。",
            subjectAssetIds: ["asset_1"],
          },
        };
        const execution = await executeTool(toolCall);
        yield { type: "tool.completed", toolCallId: toolCall.id, result: execution.result };
        for (const contextEvent of execution.contextEvents) yield contextEvent;
      },
    };
    const runner = new PiSessionRunner(runtime, registry, new SafetyGate());

    const events = await collect(runner.run({
      ...BASE_INPUT,
      policy: { kind: "world_exploration" },
    }));

    expect(events).toEqual([
      {
        type: "tool.completed",
        toolCallId: "tool_issue_1",
        result: { issue: createdIssue },
      },
      {
        type: "consistency.issue.created",
        issueId: "issue_1",
        worldId: "world_1",
      },
    ]);
  });
});

function createRunner(
  toolCall: PiToolCall,
  handler: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const runtime: PiRuntimeClient = {
    async *runSession(_input, executeTool): AsyncIterable<PiRuntimeEvent> {
      if (!executeTool) throw new Error("Expected tool executor.");
      const execution = await executeTool(toolCall);
      yield { type: "tool.completed", toolCallId: toolCall.id, result: execution.result };
    },
  };
  const registry = new WorldToolRegistry();
  registry.register(toolCall.name, handler);
  return new PiSessionRunner(runtime, registry, new SafetyGate());
}

async function collect(events: AsyncIterable<PiRuntimeEvent>) {
  const collected: PiRuntimeEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}
