import { describe, expect, it } from "vitest";
import {
  hubPersonalAccessTokenScopeSchema,
  pullRepositoryResponseSchema,
  pushReleaseRequestSchema,
  pushReleaseResponseSchema,
  repositoryRefSchema,
} from "../src/hub-api";

describe("hub api contract", () => {
  it("limits PAT scopes to repository push and pull", () => {
    expect(hubPersonalAccessTokenScopeSchema.parse("repo:push")).toBe("repo:push");
    expect(hubPersonalAccessTokenScopeSchema.parse("repo:pull")).toBe("repo:pull");
    expect(() => hubPersonalAccessTokenScopeSchema.parse("billing:read")).toThrow();
  });

  it("parses repository refs", () => {
    expect(repositoryRefSchema.parse({ owner: "ren", slug: "memory-market" })).toEqual({
      owner: "ren",
      slug: "memory-market",
    });
  });

  it("defaults optional push release notes", () => {
    expect(pushReleaseRequestSchema.parse({
      snapshot: createReleaseSnapshot(),
    }).note).toBe("");
  });

  it("limits push release notes to 4000 characters", () => {
    expect(() => pushReleaseRequestSchema.parse({
      snapshot: createReleaseSnapshot(),
      note: "x".repeat(4001),
    })).toThrow();
  });

  it("validates push release response URLs", () => {
    expect(() => pushReleaseResponseSchema.parse({
      repository: { owner: "ren", slug: "memory-market" },
      release: { id: "rel_1", version: "v1.0.0", url: "not-a-url" },
    })).toThrow();
  });

  it("defaults pull repository summaries", () => {
    const parsed = pullRepositoryResponseSchema.parse({
      repository: {
        owner: "ren",
        slug: "memory-market",
        name: "Memory Market",
      },
      snapshot: createReleaseSnapshot(),
    });

    expect(parsed.repository.summary).toBe("");
  });

  it("rejects pull responses when repository metadata disagrees with the snapshot", () => {
    expect(() => pullRepositoryResponseSchema.parse({
      repository: {
        owner: "ren",
        slug: "other-world",
        name: "Memory Market",
      },
      snapshot: createReleaseSnapshot(),
    })).toThrow();
  });
});

function createReleaseSnapshot() {
  return {
    contractVersion: "0.1.0",
    repository: {
      owner: "ren",
      slug: "memory-market",
      name: "Memory Market",
    },
    package: {
      format: "worlddock.world-package.v1",
      exportedAt: "2026-06-12T00:00:00.000Z",
      world: {
        name: "Memory Market",
        type: "city",
        summary: "A city built around traded memories.",
        tags: ["urban"],
        maturity: 32,
      },
      assets: [],
      releases: [],
    },
    createdAt: "2026-06-12T00:00:00.000Z",
    assets: [],
  };
}
