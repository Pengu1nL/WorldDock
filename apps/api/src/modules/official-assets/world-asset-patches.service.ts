import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AgentSessionsService } from "../agent-sessions/agent-sessions.service";
import { LocalStorageService } from "../local-storage/local-storage.service";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { createLineDiff, parseLineDiff, type LineDiffOperation } from "./asset-diff";
import { extractAssetSummary, indexMarkdownSections } from "./asset-markdown";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  OfficialAssetPatchAlreadyRevertedError,
  OfficialAssetPatchConflictError,
  type OfficialAssetPatchRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetsRepository,
} from "./official-assets.repository";
import { OfficialAssetLockService } from "./official-asset-lock.service";

export type ApplyWorldAssetPatchInput = {
  worldId: string;
  assetId: string;
  sessionId: string;
  afterMarkdown: string;
  reason?: string;
};

export type OfficialAssetPatchView = Omit<OfficialAssetPatchRecord, "diff"> & {
  diff: LineDiffOperation[] | null;
};

const MAX_PATCH_MARKDOWN_BYTES = 256 * 1024;
const MAX_PATCH_MARKDOWN_LINES = 1000;
const MAX_PATCH_DIFF_CELLS = 1_000_000;

@Injectable()
export class WorldAssetPatchesService {
  constructor(
    @Inject(OFFICIAL_ASSETS_REPOSITORY)
    private readonly officialAssets: OfficialAssetsRepository & Partial<OfficialAssetPatchesRepository>,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    private readonly localStorage: LocalStorageService,
    private readonly agentSessions: AgentSessionsService,
    private readonly assetLocks: OfficialAssetLockService,
  ) {}

  async applyPatch(input: ApplyWorldAssetPatchInput): Promise<OfficialAssetPatchView> {
    const afterMarkdown = input.afterMarkdown;
    const sessionId = input.sessionId.trim();
    if (afterMarkdown.trim().length === 0 || !sessionId) {
      throw this.badRequest("Patch sessionId and afterMarkdown are required.");
    }
    this.assertMarkdownWithinBounds(afterMarkdown, "Patch markdown");

    return this.assetLocks.withAssetLock(input.worldId, input.assetId, async () => {
      await this.requireWorld(input.worldId);
      const detail = await this.officialAssets.getAsset(input.worldId, input.assetId);
      if (!detail) throw this.notFound();
      await this.requireAssetEditSession(input.worldId, input.assetId, sessionId);

      const beforeMarkdown = await this.readMarkdown(detail.asset.documentKey);
      this.assertMarkdownWithinBounds(beforeMarkdown, "Current asset markdown");
      this.assertDiffWithinBounds(beforeMarkdown, afterMarkdown);
      const summary = extractAssetSummary(afterMarkdown);
      if (!summary) {
        throw this.badRequest("Patch markdown must include a non-empty 概括 section.");
      }
      const diff = createLineDiff(beforeMarkdown, afterMarkdown);
      const indexes = this.buildIndexes(afterMarkdown);

      await this.localStorage.saveObject({
        key: detail.asset.documentKey,
        contentType: "text/markdown; charset=utf-8",
        body: new TextEncoder().encode(afterMarkdown),
      });

      let patch: OfficialAssetPatchRecord | null;
      try {
        patch = await this.patchRepository().applyPatch({
          worldId: input.worldId,
          assetId: input.assetId,
          sessionId,
          expectedVersion: detail.asset.version,
          expectedBeforeRevisionId: detail.revisions[0]?.id ?? null,
          beforeMarkdown,
          afterMarkdown,
          diff: JSON.stringify(diff),
          summary,
          metadata: input.reason?.trim() ? { reason: input.reason.trim() } : {},
          indexes,
        });
        if (!patch) throw this.notFound();
      } catch (error) {
        if (error instanceof OfficialAssetPatchConflictError) {
          await this.restoreLatestRevisionMarkdown(input.worldId, input.assetId, detail.asset.documentKey, afterMarkdown);
          throw new ConflictException({
            code: "PATCH_CONFLICT",
            message: "Official asset changed while applying patch.",
          });
        }

        await this.restoreBeforeMarkdownIfUnchanged(detail.asset.documentKey, beforeMarkdown, afterMarkdown);
        throw error;
      }

      return this.toPatchView(patch);
    });
  }

  async listPatches(worldId: string, assetId: string): Promise<OfficialAssetPatchView[]> {
    await this.requireWorld(worldId);
    await this.requireAsset(worldId, assetId);
    const patches = await this.patchRepository().listPatches(worldId, assetId);
    return patches.map((patch) => this.toPatchView(patch));
  }

  async getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchView> {
    await this.requireWorld(worldId);
    await this.requireAsset(worldId, assetId);
    const patch = await this.patchRepository().getPatch(worldId, assetId, patchId);
    if (!patch) throw this.notFound();
    return this.toPatchView(patch);
  }

  async revertPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchView> {
    return this.assetLocks.withAssetLock(worldId, assetId, async () => {
      await this.requireWorld(worldId);
      const detail = await this.officialAssets.getAsset(worldId, assetId);
      if (!detail) throw this.notFound();
      const repository = this.patchRepository();
      const existingPatch = await repository.getPatch(worldId, assetId, patchId);
      if (!existingPatch) throw this.notFound();
      if (existingPatch.status !== "applied") throw this.patchAlreadyReverted();

      const markdown = existingPatch.beforeMarkdown;
      this.assertMarkdownWithinBounds(markdown, "Patch revert markdown");
      const summary = extractAssetSummary(markdown);
      if (!summary) {
        throw this.badRequest("Patch beforeMarkdown must include a non-empty 概括 section.");
      }
      const indexes = this.buildIndexes(markdown);
      const reason = `Revert patch ${patchId}`;

      await this.saveMarkdown(detail.asset.documentKey, markdown);

      let patch: OfficialAssetPatchRecord | null;
      try {
        patch = await repository.revertPatch({
          worldId,
          assetId,
          patchId,
          expectedVersion: detail.asset.version,
          expectedLatestRevisionId: detail.revisions[0]?.id ?? null,
          markdown,
          summary,
          metadata: {
            source: "patch_revert",
            patchId,
            reason,
          },
          indexes,
        });
        if (!patch) throw this.notFound();
      } catch (error) {
        await this.restoreLatestRevisionMarkdown(worldId, assetId, detail.asset.documentKey, markdown);
        if (error instanceof OfficialAssetPatchAlreadyRevertedError) {
          throw this.patchAlreadyReverted();
        }
        if (error instanceof OfficialAssetPatchConflictError) {
          throw new ConflictException({
            code: "PATCH_CONFLICT",
            message: "Official asset changed while reverting patch.",
          });
        }
        throw error;
      }

      return this.toPatchView(patch);
    });
  }

  private async requireAssetEditSession(worldId: string, assetId: string, sessionId: string) {
    const detail = await this.agentSessions.getSessionDetail(worldId, sessionId);
    if (detail.session.kind !== "asset_edit") {
      throw this.badRequest("Patch session must be an asset edit session.");
    }
    const primaryAssetSubject = detail.subjects.find((subject) =>
      subject.kind === "asset" &&
      subject.role === "primary" &&
      subject.targetId === assetId,
    );
    if (!primaryAssetSubject) {
      throw this.badRequest("Patch session primary subject must be the target asset.");
    }
    return detail.session;
  }

  private async requireAsset(worldId: string, assetId: string) {
    const detail = await this.officialAssets.getAsset(worldId, assetId);
    if (!detail) throw this.notFound();
    return detail;
  }

  private async readMarkdown(documentKey: string) {
    const stored = await this.localStorage.readObject(documentKey);
    return new TextDecoder().decode(stored.body);
  }

  private async restoreLatestRevisionMarkdown(worldId: string, assetId: string, documentKey: string, afterMarkdown: string) {
    try {
      const latest = await this.officialAssets.getAsset(worldId, assetId);
      const latestMarkdown = latest?.revisions[0]?.markdown;
      if (latestMarkdown === undefined) return;
      await this.saveMarkdownIfCurrentMarkdownEquals(documentKey, afterMarkdown, latestMarkdown);
    } catch {
      // Keep the original conflict as the surfaced error.
    }
  }

  private async restoreBeforeMarkdownIfUnchanged(documentKey: string, beforeMarkdown: string, afterMarkdown: string) {
    try {
      await this.saveMarkdownIfCurrentMarkdownEquals(documentKey, afterMarkdown, beforeMarkdown);
    } catch {
      // Keep the original repository/storage error as the surfaced error.
    }
  }

  private async saveMarkdownIfCurrentMarkdownEquals(documentKey: string, expectedMarkdown: string, markdown: string) {
    await this.localStorage.saveObjectIfCurrentBodyEquals({
      key: documentKey,
      expectedBody: new TextEncoder().encode(expectedMarkdown),
      contentType: "text/markdown; charset=utf-8",
      body: new TextEncoder().encode(markdown),
    });
  }

  private async saveMarkdown(documentKey: string, markdown: string) {
    await this.localStorage.saveObject({
      key: documentKey,
      contentType: "text/markdown; charset=utf-8",
      body: new TextEncoder().encode(markdown),
    });
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private patchRepository(): OfficialAssetPatchesRepository {
    const repository = this.officialAssets;
    if (!repository.applyPatch || !repository.listPatches || !repository.getPatch || !repository.revertPatch) {
      throw new Error("Official asset patch repository is not configured.");
    }
    return repository as OfficialAssetPatchesRepository;
  }

  private toPatchView(patch: OfficialAssetPatchRecord): OfficialAssetPatchView {
    return {
      ...patch,
      diff: parseLineDiff(patch.diff),
    };
  }

  private buildIndexes(markdown: string) {
    return indexMarkdownSections(markdown).map((section, order) => ({
      title: section.heading,
      summary: section.summary,
      metadata: {
        level: section.level,
        order,
      },
    }));
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Official asset patch not found.",
    });
  }

  private badRequest(message: string) {
    return new BadRequestException({
      code: "BAD_REQUEST",
      message,
    });
  }

  private patchAlreadyReverted() {
    return new ConflictException({
      code: "PATCH_ALREADY_REVERTED",
      message: "World asset patch has already been reverted.",
    });
  }

  private assertMarkdownWithinBounds(markdown: string, label: string) {
    const byteLength = new TextEncoder().encode(markdown).byteLength;
    if (byteLength > MAX_PATCH_MARKDOWN_BYTES) {
      throw this.badRequest(`${label} exceeds the ${MAX_PATCH_MARKDOWN_BYTES} byte limit.`);
    }
    const lineCount = countLines(markdown);
    if (lineCount > MAX_PATCH_MARKDOWN_LINES) {
      throw this.badRequest(`${label} exceeds the ${MAX_PATCH_MARKDOWN_LINES} line limit.`);
    }
  }

  private assertDiffWithinBounds(beforeMarkdown: string, afterMarkdown: string) {
    const beforeLines = countLines(beforeMarkdown);
    const afterLines = countLines(afterMarkdown);
    if (beforeLines * afterLines > MAX_PATCH_DIFF_CELLS) {
      throw this.badRequest("Patch markdown is too large to diff.");
    }
  }
}

function countLines(markdown: string) {
  if (markdown.length === 0) return 1;
  let lines = 1;
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "\n") lines += 1;
  }
  return lines;
}
