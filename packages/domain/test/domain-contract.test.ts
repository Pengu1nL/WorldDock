import { describe, expect, it } from "vitest";
import {
  agentSeedSchema,
  apiErrorSchema,
  publicRepositorySchema,
  suggestionSchema,
  worldSchema,
} from "../src";

describe("@worlddock/domain contracts", () => {
  it("validates the core world shape used by the current web MVP", () => {
    expect(() =>
      worldSchema.parse({
        id: "world_memory",
        name: "回忆所",
        type: "近未来 / 软科幻",
        tags: ["记忆", "制度"],
        summary: "记忆可以被买卖的近未来社会。",
        maturity: 64,
        status: "draft",
        visibility: "private",
        archive: 3,
        seeds: 2,
        conflicts: 1,
        updated: "刚刚",
        mode: "cloud",
      }),
    ).not.toThrow();
  });

  it("keeps suggestions as a discriminated union by kind", () => {
    const parsed = suggestionSchema.parse({
      id: "seed1",
      kind: "seed",
      category: "故事种子",
      title: "继承的童年",
      hook: "她发现一段不属于自己的童年记忆。",
      trigger: "记忆账户进入遗产流程。",
      conflict: "人格权与继承权冲突。",
      protagonists: "律师、继承人、原始记忆出售者",
      questions: ["记忆能被继承吗？"],
    });

    expect(parsed.kind).toBe("seed");
  });

  it("requires public repositories to carry license and release metadata", () => {
    expect(() =>
      publicRepositorySchema.parse({
        id: "repo_memory",
        owner: "ren",
        slug: "memory-market",
        name: "回忆所",
        summary: "记忆交易社会。",
        tags: ["记忆"],
        stars: 12,
        forks: 2,
        updated: "刚刚",
        version: "v0.1.0",
        visibility: "public",
        license: "free-fork-attribution",
        releases: [
          {
            version: "v0.1.0",
            updated: "刚刚",
            note: "初始发布",
            addedSettings: 3,
            changedSettings: 0,
            removedSettings: 0,
            addedSeeds: 2,
            source: "cloud-publish",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("defines the API error envelope shared by backend and frontend", () => {
    expect(() =>
      apiErrorSchema.parse({
        code: "AUTH_REQUIRED",
        message: "需要登录后继续。",
        requestId: "req_123",
      }),
    ).not.toThrow();
  });

  it("validates agent seed fixtures with nested suggestions and issues", () => {
    expect(() =>
      agentSeedSchema.parse({
        id: "memory",
        title: "记忆可以被买卖",
        inspiration: "一个世界里，记忆可以被买卖。",
        suggestedName: "回忆所",
        suggestedType: "近未来 / 软科幻",
        styles: ["制度细节"],
        coreSetting: "记忆被确认为可交易资产。",
        coreConflict: "记忆是财产还是人格？",
        directions: ["细化交易制度"],
        firstQuestion: "这是合法市场还是灰色行业？",
        tools: [{ id: "ctx", label: "分析灵感", detail: "提取核心概念" }],
        responseChunks: ["好。"],
        suggestions: [
          {
            id: "s1",
            kind: "setting",
            category: "世界规则",
            title: "《记忆交易法》",
            summary: "确立交易规则。",
            body: "只允许认证机构交易。",
          },
        ],
        archive: { "世界规则": 1 },
        issues: [
          {
            id: "i1",
            title: "亲属记忆边界",
            description: "需要解释禁令范围。",
            involves: ["s1"],
            severity: "important",
          },
        ],
      }),
    ).not.toThrow();
  });
});
