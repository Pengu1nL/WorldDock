import { describe, expect, it } from "vitest";
import * as contract from "../src";
import { releaseSnapshotSchema } from "../src/releases";

describe("release snapshot contract", () => {
  it("accepts a minimal published snapshot with contractVersion", () => {
    const parsed = releaseSnapshotSchema.parse({
      contractVersion: "0.1.0",
      repository: {
        owner: "studio",
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
    });

    expect(parsed.contractVersion).toBe("0.1.0");
    expect(parsed.package.format).toBe("worlddock.world-package.v1");
  });

  it("does not expose hub contracts from the root entry", () => {
    expect("hubPersonalAccessTokenScopeSchema" in contract).toBe(false);
  });
});
