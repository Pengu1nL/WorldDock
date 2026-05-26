import type { World } from "@worlddock/domain";
import type { AssetCounts, WorldRecord } from "./world.repository";

export function mapWorld(record: WorldRecord, counts: AssetCounts): World {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    tags: record.tags,
    summary: record.summary,
    maturity: record.maturity,
    status: record.status,
    visibility: record.visibility,
    archive: counts.archive,
    seeds: counts.seeds,
    conflicts: counts.conflicts,
    updated: record.updatedAt.toISOString(),
    mode: record.mode,
  };
}
