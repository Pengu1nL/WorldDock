import { describe, expect, it } from "vitest";
import { MOCK } from "../mock-data";
import {
  agentSeedSchema,
  worldSchema,
} from "@worlddock/domain";

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
});
