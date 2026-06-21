import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");

describe("story-first Prisma schema", () => {
  it("defines narratives, chapters, narrative assets, versions, and relations", () => {
    expect(schema).toContain("model Narrative {");
    expect(schema).toContain("model Chapter {");
    expect(schema).toContain("model NarrativeAsset {");
    expect(schema).toContain("model NarrativeAssetVersion {");
    expect(schema).toContain("model NarrativeAssetRelation {");
  });

  it("keeps project ID, table, relation, and indexing conventions", () => {
    expect(schema).toMatch(/model Narrative \{[\s\S]*id\s+String\s+@id @default\(cuid\(\)\)/);
    expect(schema).toContain("@@map(\"narratives\")");
    expect(schema).toContain("@@map(\"chapters\")");
    expect(schema).toContain("@@map(\"narrative_assets\")");
    expect(schema).toContain("@@map(\"narrative_asset_versions\")");
    expect(schema).toContain("@@map(\"narrative_asset_relations\")");
    expect(schema).toContain("@@index([worldId])");
    expect(schema).toContain("@@unique([narrativeId, order])");
    expect(schema).toContain("@@index([narrativeId, kind])");
  });

  it("extends agent sessions for asynchronous story progression", () => {
    expect(schema).toContain("chapterId       String?");
    expect(schema).toContain("chapter         Chapter?");
    expect(schema).toContain("@@index([worldId, chapterId])");
  });
});
