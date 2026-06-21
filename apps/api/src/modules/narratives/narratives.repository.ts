export const NARRATIVES_REPOSITORY = Symbol("NARRATIVES_REPOSITORY");

export type NarrativeStatus = "draft" | "in_progress" | "completed" | "archived";
export type ChapterStatus = "draft" | "completed" | "revised";
export type NarrativeAssetKind = "character" | "location" | "item" | "event" | "concept" | "faction";

export type NarrativeRecord = {
  id: string;
  worldId: string | null;
  title: string;
  synopsis: string | null;
  status: NarrativeStatus;
  metadata: Record<string, unknown>;
  visualStyle: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type ChapterRecord = {
  id: string;
  narrativeId: string;
  order: number;
  title: string;
  content: string;
  wordCount: number;
  status: ChapterStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type NarrativeAssetRecord = {
  id: string;
  narrativeId: string;
  kind: NarrativeAssetKind;
  name: string;
  summary: string;
  body: string | null;
  tags: string[];
  appearance: string | null;
  mood: string | null;
  visualPrompt: string | null;
  nameEmbedding: unknown | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type NarrativeAssetVersionRecord = {
  id: string;
  assetId: string;
  chapterId: string;
  snapshot: Record<string, unknown>;
  diff: Record<string, unknown> | null;
  createdAt: Date;
};

export type NarrativeAssetRelationRecord = {
  id: string;
  narrativeId: string;
  sourceAssetId: string;
  targetAssetId: string;
  relationType: string;
  description: string | null;
  createdAt: Date;
};

export type CreateNarrativeAssetInput = Pick<
  NarrativeAssetRecord,
  | "narrativeId"
  | "kind"
  | "name"
  | "summary"
  | "body"
  | "tags"
  | "appearance"
  | "mood"
  | "visualPrompt"
  | "nameEmbedding"
  | "metadata"
>;
export type UpdateNarrativeAssetInput = Partial<Omit<CreateNarrativeAssetInput, "narrativeId">>;
export type CreateNarrativeAssetVersionInput = Pick<NarrativeAssetVersionRecord, "assetId" | "chapterId" | "snapshot" | "diff">;
export type CreateNarrativeAssetRelationInput = Pick<
  NarrativeAssetRelationRecord,
  "narrativeId" | "sourceAssetId" | "targetAssetId" | "relationType" | "description"
>;

export type NarrativeChildCounts = {
  chapters: number;
  assets: number;
};

export type CreateNarrativeInput = Pick<NarrativeRecord, "worldId" | "title" | "synopsis" | "status" | "metadata"> &
  Partial<Pick<NarrativeRecord, "visualStyle">>;
export type UpdateNarrativeInput = Partial<Pick<NarrativeRecord, "worldId" | "title" | "synopsis" | "status" | "metadata" | "visualStyle">>;
export type ListNarrativesQuery = {
  worldId?: string;
};

export type CreateChapterInput = Pick<ChapterRecord, "narrativeId" | "order" | "title" | "content" | "wordCount" | "status" | "metadata">;
export type UpdateChapterInput = Partial<Pick<ChapterRecord, "order" | "title" | "content" | "wordCount" | "status" | "metadata">>;

export type ListNarrativeAssetsQuery = {
  kind?: NarrativeAssetKind;
  q?: string;
};

export type NarrativesRepository = {
  createNarrative(input: CreateNarrativeInput): Promise<NarrativeRecord>;
  listNarratives(query?: ListNarrativesQuery): Promise<NarrativeRecord[]>;
  findNarrativeById(id: string): Promise<NarrativeRecord | null>;
  updateNarrative(id: string, input: UpdateNarrativeInput): Promise<NarrativeRecord | null>;
  deleteNarrative(id: string): Promise<NarrativeRecord | null>;
  countNarrativeChildren(narrativeId: string): Promise<NarrativeChildCounts>;

  listChapters(narrativeId: string): Promise<ChapterRecord[]>;
  findChapter(narrativeId: string, chapterId: string): Promise<ChapterRecord | null>;
  createChapter(input: CreateChapterInput): Promise<ChapterRecord>;
  updateChapter(narrativeId: string, chapterId: string, input: UpdateChapterInput): Promise<ChapterRecord | null>;
  deleteChapter(narrativeId: string, chapterId: string): Promise<ChapterRecord | null>;

  listAssets(narrativeId: string, query?: ListNarrativeAssetsQuery): Promise<NarrativeAssetRecord[]>;
  findAsset(narrativeId: string, assetId: string): Promise<NarrativeAssetRecord | null>;
  findAssetByName(narrativeId: string, kind: NarrativeAssetKind, name: string): Promise<NarrativeAssetRecord | null>;
  createAsset(input: CreateNarrativeAssetInput): Promise<NarrativeAssetRecord>;
  updateAsset(narrativeId: string, assetId: string, input: UpdateNarrativeAssetInput): Promise<NarrativeAssetRecord | null>;
  createAssetVersion(input: CreateNarrativeAssetVersionInput): Promise<NarrativeAssetVersionRecord>;
  listAssetVersions(assetId: string): Promise<NarrativeAssetVersionRecord[]>;
  createAssetRelation(input: CreateNarrativeAssetRelationInput): Promise<NarrativeAssetRelationRecord>;
};
