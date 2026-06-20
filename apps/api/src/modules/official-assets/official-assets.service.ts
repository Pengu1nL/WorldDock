import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { OfficialWorldAssetStatus, OfficialWorldAssetType } from "@worlddock/contract/assets";
import { LocalStorageService } from "../local-storage/local-storage.service";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { buildInitialAssetMarkdown, extractAssetSummary, indexMarkdownSections } from "./asset-markdown";
import { OfficialAssetLockService } from "./official-asset-lock.service";
import {
  InvalidOfficialAssetListCursorError,
  OFFICIAL_ASSETS_REPOSITORY,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetRecord,
  type OfficialAssetsRepository,
} from "./official-assets.repository";

export type CreateOfficialAssetInput = {
  id?: string;
  type: OfficialWorldAssetType;
  name: string;
  summary: string;
  markdown?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type UpdateOfficialAssetInput = {
  name?: string;
  summary?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: OfficialWorldAssetStatus;
};

@Injectable()
export class OfficialAssetsService {
  constructor(
    @Inject(OFFICIAL_ASSETS_REPOSITORY) private readonly officialAssets: OfficialAssetsRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(LocalStorageService) private readonly localStorage: LocalStorageService,
    @Inject(OfficialAssetLockService) private readonly assetLocks: OfficialAssetLockService,
  ) {}

  async createAsset(worldId: string, input: CreateOfficialAssetInput): Promise<OfficialAssetDetailRecord & { markdown: string }> {
    await this.requireWorld(worldId);

    const conflictingAsset = await this.findActiveAssetByName(worldId, input.name);
    if (conflictingAsset) throw this.nameConflict(input.name, conflictingAsset);

    const requestedAssetId = cleanAssetId(input.id);
    const assetId = requestedAssetId ?? `official_asset_${randomUUID()}`;
    const markdown = input.markdown?.trim() || buildInitialAssetMarkdown({
      type: input.type,
      name: input.name,
      summary: input.summary,
    });
    const documentKey = `worlds/${worldId}/official-assets/${documentKeyStemForAsset(assetId, Boolean(requestedAssetId))}.md`;
    const summary = extractAssetSummary(markdown) || input.summary;
    const indexes = this.buildSectionIndexInputs(markdown);

    await this.localStorage.saveObject({
      key: documentKey,
      contentType: "text/markdown; charset=utf-8",
      body: new TextEncoder().encode(markdown),
    });

    let created: OfficialAssetDetailRecord;
    try {
      created = await this.officialAssets.createAsset({
        id: assetId,
        worldId,
        type: input.type,
        name: input.name,
        summary,
        documentKey,
        tags: input.tags ?? [],
        metadata: input.metadata ?? {},
        initialRevision: {
          markdown,
          summary,
          metadata: {},
        },
        indexes,
      });
    } catch (error) {
      await this.localStorage.deleteObject(documentKey);
      throw error;
    }

    return { ...created, markdown };
  }

  async updateAsset(
    worldId: string,
    assetId: string,
    input: UpdateOfficialAssetInput,
  ): Promise<OfficialAssetDetailRecord & { markdown: string }> {
    await this.requireWorld(worldId);
    return this.assetLocks.withAssetLock(worldId, assetId, async () => {
      const detail = await this.officialAssets.updateAsset(worldId, assetId, input);
      if (!detail) throw this.notFound();

      return {
        ...detail,
        markdown: await this.readMarkdown(detail.asset.documentKey),
      };
    });
  }

  async listAssets(worldId: string, query?: ListOfficialAssetsQuery) {
    await this.requireWorld(worldId);
    try {
      return await this.officialAssets.listAssets(worldId, query);
    } catch (error) {
      if (error instanceof InvalidOfficialAssetListCursorError) throw this.badCursor();
      throw error;
    }
  }

  async findActiveAssetByName(worldId: string, name: string): Promise<OfficialAssetRecord | null> {
    await this.requireWorld(worldId);
    const normalizedName = normalizeAssetName(name);
    if (!normalizedName) return null;

    const finder = this.officialAssets.findActiveAssetByName;
    if (finder) return finder.call(this.officialAssets, worldId, name);

    const listAssets = (this.officialAssets as { listAssets?: OfficialAssetsRepository["listAssets"] }).listAssets;
    if (typeof listAssets !== "function") return null;

    const { assets } = await listAssets.call(this.officialAssets, worldId, { q: name, limit: 50 });
    return assets.find((asset) =>
      asset.status === "active" && normalizeAssetName(asset.name) === normalizedName
    ) ?? null;
  }

  async getAsset(worldId: string, assetId: string): Promise<OfficialAssetDetailRecord & { markdown: string }> {
    await this.requireWorld(worldId);
    return this.assetLocks.withAssetLock(worldId, assetId, async () => {
      const detail = await this.officialAssets.getAsset(worldId, assetId);
      if (!detail) throw this.notFound();

      return {
        ...detail,
        markdown: await this.readMarkdown(detail.asset.documentKey),
      };
    });
  }

  private buildSectionIndexInputs(markdown: string) {
    return indexMarkdownSections(markdown).map((section, order) => ({
      title: section.heading,
      summary: section.summary,
      metadata: {
        level: section.level,
        order,
      },
    }));
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

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Official asset not found.",
    });
  }

  private badCursor() {
    return new BadRequestException({
      code: "BAD_REQUEST",
      message: "Invalid official asset cursor.",
    });
  }

  private nameConflict(name: string, existingAsset: OfficialAssetRecord) {
    return new ConflictException({
      code: "OFFICIAL_ASSET_NAME_CONFLICT",
      message: "Official asset name already exists. Choose another name or update the existing asset.",
      details: {
        name,
        existingAsset: {
          id: existingAsset.id,
          name: existingAsset.name,
          type: existingAsset.type,
          summary: existingAsset.summary,
        },
      },
    });
  }
}

function cleanAssetId(assetId: string | undefined) {
  const trimmed = assetId?.trim();
  return trimmed ? trimmed : undefined;
}

function documentKeyStemForAsset(assetId: string, deterministicAssetId: boolean) {
  if (!deterministicAssetId) return assetId;
  return `${assetId}-${randomUUID()}`;
}

function normalizeAssetName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
