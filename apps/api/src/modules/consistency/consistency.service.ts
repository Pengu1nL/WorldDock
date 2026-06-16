import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type ConsistencyIssueStatus } from "@worlddock/contract/consistency";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type OfficialAssetsRepository,
} from "../official-assets/official-assets.repository";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { ConsistencyChecker } from "./consistency-checker";
import {
  CONSISTENCY_REPOSITORY,
  InvalidConsistencyIssueListCursorError,
  type ConsistencyIssueDetail,
  type ConsistencyIssueRecord,
  type ConsistencyRepository,
  type ListConsistencyIssuesQuery,
} from "./consistency.repository";

@Injectable()
export class ConsistencyService {
  constructor(
    @Inject(CONSISTENCY_REPOSITORY) private readonly consistencyIssues: ConsistencyRepository,
    @Inject(OFFICIAL_ASSETS_REPOSITORY) private readonly officialAssets: OfficialAssetsRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    private readonly checker: ConsistencyChecker,
  ) {}

  async runCheck(worldId: string): Promise<{ issues: ConsistencyIssueRecord[] }> {
    await this.requireWorld(worldId);
    const assets = await this.listActiveOfficialAssetsWithMarkdown(worldId);
    const checked = this.checker.check(assets);
    const issues: ConsistencyIssueRecord[] = [];

    for (const issue of checked) {
      const sortedSubjectAssetIds = [...issue.subjectAssetIds].sort();
      const dedupeKey = `${sortedSubjectAssetIds.join(":")}::${issue.title}`;

      issues.push(await this.consistencyIssues.createIssueIfOpenDedupeKeyAbsent({
        worldId,
        title: issue.title,
        description: `检测到官方资产围绕「${issue.keyword}」存在潜在冲突。`,
        involves: sortedSubjectAssetIds,
        severity: issue.severity,
        subjectAssetIds: sortedSubjectAssetIds,
        evidence: issue.evidence.map((entry) => ({
          assetId: entry.assetId,
          quote: entry.quote,
          field: entry.field,
          confidence: 1,
        })),
        metadata: {
          dedupeKey,
          keyword: issue.keyword,
        },
      }, dedupeKey));
    }

    return { issues };
  }

  async listIssues(
    worldId: string,
    query: ListConsistencyIssuesQuery = {},
  ): Promise<{ issues: ConsistencyIssueRecord[]; nextCursor: string | null }> {
    await this.requireWorld(worldId);
    try {
      return await this.consistencyIssues.listIssues(worldId, { ...query, status: query.status ?? "open" });
    } catch (error) {
      if (error instanceof InvalidConsistencyIssueListCursorError) throw this.badCursor();
      throw error;
    }
  }

  async getIssue(worldId: string, issueId: string): Promise<ConsistencyIssueDetail | null> {
    await this.requireWorld(worldId);
    return this.consistencyIssues.getIssue(worldId, issueId);
  }

  async updateIssueStatus(
    worldId: string,
    issueId: string,
    status: ConsistencyIssueStatus,
  ): Promise<ConsistencyIssueRecord | null> {
    await this.requireWorld(worldId);
    return this.consistencyIssues.updateIssueStatus(worldId, issueId, status);
  }

  private async listActiveOfficialAssetsWithMarkdown(worldId: string) {
    const assets = [];
    let cursor: string | undefined;

    do {
      const page = await this.officialAssets.listAssets(worldId, { cursor, limit: 50 });
      for (const asset of page.assets) {
        if (asset.status !== "active") continue;
        const detail = await this.officialAssets.getAsset(worldId, asset.id);
        if (!detail) continue;
        assets.push({
          assetId: detail.asset.id,
          type: detail.asset.type,
          name: detail.asset.name,
          summary: detail.asset.summary,
          markdown: detail.revisions[0]?.markdown ?? "",
        });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return assets;
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Consistency issue not found.",
    });
  }

  private badCursor() {
    return new BadRequestException({
      code: "BAD_REQUEST",
      message: "Invalid consistency issue cursor.",
    });
  }
}
