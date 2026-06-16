import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type ConsistencyIssueStatus } from "@worlddock/contract/consistency";
import { AgentSessionsService } from "../agent-sessions/agent-sessions.service";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type OfficialAssetsRepository,
} from "../official-assets/official-assets.repository";
import { WorldAssetPatchesService, type OfficialAssetPatchBatchView } from "../official-assets/world-asset-patches.service";
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
    private readonly agentSessions: AgentSessionsService,
    private readonly assetPatches: WorldAssetPatchesService,
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

  async createRepairSession(worldId: string, issueId: string, input: { title?: string }) {
    await this.requireWorld(worldId);
    const issue = await this.consistencyIssues.getIssue(worldId, issueId);
    if (!issue) throw this.notFound();

    const assets = await this.listIssueAssetContext(worldId, issue.subjectAssetIds);
    const session = await this.agentSessions.createSession(worldId, {
      kind: "consistency_repair",
      issueId,
      title: input.title,
      contextItems: [
        {
          kind: "consistency_issue",
          targetId: issue.id,
          title: issue.title,
          summary: issue.description,
          metadata: {
            severity: issue.severity,
            status: issue.status,
            subjectAssetIds: issue.subjectAssetIds,
          },
        },
        ...assets.map((asset) => ({
          kind: "asset_document" as const,
          targetId: asset.id,
          title: asset.name,
          summary: asset.summary,
          metadata: {
            documentKey: asset.documentKey,
            version: asset.version,
            type: asset.type,
            source: "consistency_issue",
          },
        })),
      ],
    });

    return this.agentSessions.getSessionDetail(worldId, session.id);
  }

  async applyPatchBatch(input: {
    worldId: string;
    issueId: string;
    sessionId: string;
    patches: Array<{
      assetId: string;
      afterMarkdown: string;
      reason?: string;
    }>;
  }): Promise<OfficialAssetPatchBatchView> {
    await this.requireWorld(input.worldId);
    if (!input.patches.length) throw this.badRequest("Patch batch must include at least one patch.");
    const issue = await this.consistencyIssues.getIssue(input.worldId, input.issueId);
    if (!issue) throw this.notFound();

    const batch = await this.assetPatches.createPatchBatch({
      worldId: input.worldId,
      issueId: input.issueId,
      sessionId: input.sessionId,
    });
    const applied: Array<{ assetId: string; patchId: string }> = [];

    try {
      for (const patch of input.patches) {
        const appliedPatch = await this.assetPatches.applyConsistencyRepairPatch({
          worldId: input.worldId,
          issueId: input.issueId,
          sessionId: input.sessionId,
          batchId: batch.id,
          allowedAssetIds: issue.subjectAssetIds,
          assetId: patch.assetId,
          afterMarkdown: patch.afterMarkdown,
          reason: patch.reason,
        });
        applied.push({ assetId: patch.assetId, patchId: appliedPatch.id });
      }
      const appliedBatch = await this.assetPatches.markPatchBatchApplied(input.worldId, batch.id);
      await this.consistencyIssues.updateIssueStatus(input.worldId, input.issueId, "resolved");
      return appliedBatch;
    } catch (error) {
      for (const patch of [...applied].reverse()) {
        try {
          await this.assetPatches.revertPatch(input.worldId, patch.assetId, patch.patchId);
        } catch {
          // Surface the original apply error; best-effort compensation may fail under concurrent edits.
        }
      }
      try {
        await this.assetPatches.markPatchBatchReverted(input.worldId, batch.id);
      } catch {
        // Keep the original error.
      }
      throw error;
    }
  }

  async revertPatchBatch(worldId: string, issueId: string, batchId: string): Promise<OfficialAssetPatchBatchView> {
    await this.requireWorld(worldId);
    const issue = await this.consistencyIssues.getIssue(worldId, issueId);
    if (!issue) throw this.notFound();
    const batch = await this.assetPatches.getPatchBatch(worldId, batchId);
    if (batch.issueId !== issueId) {
      throw this.badRequest("Patch batch does not belong to the consistency issue.");
    }
    if (batch.status !== "applied") {
      throw this.badRequest("Only applied patch batches can be reverted.");
    }

    const patches = await this.assetPatches.listPatchesByBatch(worldId, batchId);
    for (const patch of [...patches].reverse()) {
      await this.assetPatches.revertPatch(worldId, patch.assetId, patch.id);
    }

    const reverted = await this.assetPatches.markPatchBatchReverted(worldId, batchId);
    await this.consistencyIssues.updateIssueStatus(worldId, issueId, "open");
    return reverted;
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

  private async listIssueAssetContext(worldId: string, assetIds: string[]) {
    const assets = [];
    for (const assetId of assetIds) {
      const detail = await this.officialAssets.getAsset(worldId, assetId);
      if (detail) assets.push(detail.asset);
    }
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

  private badRequest(message: string) {
    return new BadRequestException({
      code: "BAD_REQUEST",
      message,
    });
  }
}
