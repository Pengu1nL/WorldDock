import { describe, expect, it } from "vitest";
import { MOCK } from "../mock-data";
import {
  agentSeedSchema,
  publicRepositorySchema,
  worldSchema,
} from "../domain";

describe("worlddock domain schemas", () => {
  it("validates every premade world", () => {
    for (const world of MOCK.PREMADE_WORLDS) {
      expect(() => worldSchema.parse(world)).not.toThrow();
    }
  });

  it("validates every agent seed", () => {
    for (const seed of Object.values(MOCK.SEEDS)) {
      expect(() => agentSeedSchema.parse(seed)).not.toThrow();
    }
  });

  it("rejects a repository without license", () => {
    const invalidRepository = {
      id: "repo_bad",
      owner: "ren",
      slug: "bad-world",
      name: "Bad World",
      summary: "Missing license should fail.",
      tags: [],
      stars: 0,
      forks: 0,
      updated: "刚刚",
      version: "v0.1.0",
      visibility: "public",
    };

    expect(() => publicRepositorySchema.parse(invalidRepository)).toThrow();
  });
});
