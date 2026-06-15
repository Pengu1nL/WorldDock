import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AgentSessionsService } from "../agent-sessions/agent-sessions.service";
import { LocalStorageService } from "../local-storage/local-storage.service";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { createLineDiff, parseLineDiff, type LineDiffOperation } from "./asset-diff";
import { extractAssetSummary, indexMarkdownSections } from "./asset-markdown";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type OfficialAssetPatchRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetsRepository,
} from "./official-assets.repository";

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

@Injectable()
export class WorldAssetPatchesService {
  constructor(
    @Inject(OFFICIAL_ASSETS_REPOSITORY)
    private readonly officialAssets: OfficialAssetsRepository & Partial<OfficialAssetPatchesRepository>,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    private readonly localStorage: LocalStorageService,
    private readonly agentSessions: AgentSessionsService,
  ) {}

  async applyPatch(input: ApplyWorldAssetPatchInput): Promise<OfficialAssetPatchView> {
    const afterMarkdown = input.afterMarkdown.trim();
    const sessionId = input.sessionId.trim();
    if (!afterMarkdown || !sessionId) throw this.badRequest("Patch sessionId and afterMarkdown are required.");

    await this.requireWorld(input.worldId);
    const detail = await this.officialAssets.getAsset(input.worldId, input.assetId);
    if (!detail) throw this.notFound();
    await this.requireAssetEditSession(input.worldId, input.assetId, sessionId);

    const beforeMarkdown = await this.readMarkdown(detail.asset.documentKey);
    const diff = createLineDiff(beforeMarkdown, afterMarkdown);
    const summary = extractAssetSummary(afterMarkdown) || detail.asset.summary;
    const indexes = indexMarkdownSections(afterMarkdown).map((section, order) => ({
      title: section.heading,
      summary: section.summary,
      metadata: {
        level: section.level,
        order,
      },
    }));

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
        beforeMarkdown,
        afterMarkdown,
        diff: JSON.stringify(diff),
        summary,
        metadata: input.reason?.trim() ? { reason: input.reason.trim() } : {},
        indexes,
      });
      if (!patch) throw this.notFound();
    } catch (error) {
      await this.localStorage.saveObject({
        key: detail.asset.documentKey,
        contentType: "text/markdown; charset=utf-8",
        body: new TextEncoder().encode(beforeMarkdown),
      });
      throw error;
    }

    return this.toPatchView(patch);
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

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private patchRepository(): OfficialAssetPatchesRepository {
    const repository = this.officialAssets;
    if (!repository.applyPatch || !repository.listPatches || !repository.getPatch) {
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
}
