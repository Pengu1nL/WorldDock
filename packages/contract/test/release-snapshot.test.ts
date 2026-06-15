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

  it("accepts a v2 published snapshot with official markdown assets", () => {
    const parsed = releaseSnapshotSchema.parse({
      contractVersion: "1.0.0",
      repository: {
        owner: "studio",
        slug: "memory-market",
        name: "Memory Market",
      },
      package: {
        format: "worlddock.world-package.v2",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "Memory Market",
          type: "city",
          summary: "A city built around traded memories.",
          tags: ["urban"],
          maturity: 32,
        },
        assets: [
          {
            type: "rule",
            name: "Memory Trading Permit",
            summary: "All memory trades require registration.",
            markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
            tags: ["law"],
            metadata: { source: "test" },
            status: "active",
            version: 1,
          },
        ],
        releases: [],
      },
      createdAt: "2026-06-12T00:00:00.000Z",
      assets: [
        {
          id: "official_asset_1",
          type: "rule",
          name: "Memory Trading Permit",
          summary: "All memory trades require registration.",
          markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
          tags: ["law"],
          metadata: { source: "test" },
          status: "active",
          version: 1,
        },
      ],
    });

    expect(parsed.package.format).toBe("worlddock.world-package.v2");
    expect(parsed.package.assets[0]).toMatchObject({
      type: "rule",
      name: "Memory Trading Permit",
      markdown: expect.stringContaining("All memory trades require registration"),
    });
    expect(parsed.assets[0]).toMatchObject({
      id: "official_asset_1",
      type: "rule",
      name: "Memory Trading Permit",
    });
  });

  it("rejects a v1 snapshot with official snapshot assets", () => {
    expect(() => releaseSnapshotSchema.parse({
      contractVersion: "1.0.0",
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
      assets: [
        {
          id: "official_asset_1",
          type: "rule",
          name: "Memory Trading Permit",
          summary: "All memory trades require registration.",
          markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
          tags: ["law"],
          metadata: { source: "test" },
        },
      ],
    })).toThrow();
  });

  it("rejects a v2 snapshot when top-level official assets are missing", () => {
    expect(() => releaseSnapshotSchema.parse({
      contractVersion: "1.0.0",
      repository: {
        owner: "studio",
        slug: "memory-market",
        name: "Memory Market",
      },
      package: {
        format: "worlddock.world-package.v2",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "Memory Market",
          type: "city",
          summary: "A city built around traded memories.",
          tags: ["urban"],
          maturity: 32,
        },
        assets: [
          {
            type: "rule",
            name: "Memory Trading Permit",
            summary: "All memory trades require registration.",
            markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
            tags: ["law"],
            metadata: { source: "test" },
          },
        ],
        releases: [],
      },
      createdAt: "2026-06-12T00:00:00.000Z",
      assets: [],
    })).toThrow();
  });

  it("rejects a v2 snapshot when package and top-level official assets differ", () => {
    expect(() => releaseSnapshotSchema.parse({
      contractVersion: "1.0.0",
      repository: {
        owner: "studio",
        slug: "memory-market",
        name: "Memory Market",
      },
      package: {
        format: "worlddock.world-package.v2",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "Memory Market",
          type: "city",
          summary: "A city built around traded memories.",
          tags: ["urban"],
          maturity: 32,
        },
        assets: [
          {
            type: "rule",
            name: "Memory Trading Permit",
            summary: "All memory trades require registration.",
            markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
            tags: ["law"],
            metadata: { source: "test" },
          },
        ],
        releases: [],
      },
      createdAt: "2026-06-12T00:00:00.000Z",
      assets: [
        {
          id: "official_asset_1",
          type: "rule",
          name: "Different Permit",
          summary: "All memory trades require registration.",
          markdown: "# Memory Trading Permit\n\nAll memory trades require registration.",
          tags: ["law"],
          metadata: { source: "test" },
        },
      ],
    })).toThrow();
  });

  it("does not expose hub contracts from the root entry", () => {
    expect("hubPersonalAccessTokenScopeSchema" in contract).toBe(false);
  });
});
