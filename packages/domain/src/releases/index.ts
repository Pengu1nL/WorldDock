import { z } from "zod";

export const releaseStatusSchema = z.enum(["draft", "published", "archived"]);
export const releaseDiffKindSchema = z.enum(["added", "changed", "removed"]);

export const releaseChangeSchema = z.object({
  assetId: z.string().min(1),
  kind: releaseDiffKindSchema,
  title: z.string().min(1),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
});

export const releaseDiffSchema = z.object({
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
});

export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type ReleaseDiffKind = z.infer<typeof releaseDiffKindSchema>;
export type ReleaseChange = z.infer<typeof releaseChangeSchema>;
export type ReleaseDiff = z.infer<typeof releaseDiffSchema>;

export {
  contractVersionSchema,
  releaseSnapshotAssetSchema as contractReleaseSnapshotAssetSchema,
  releaseSnapshotAssetSchema,
  releaseSnapshotSchema as contractReleaseSnapshotSchema,
  releaseSnapshotSchema,
} from "@worlddock/contract/releases";
export type {
  ReleaseSnapshot as ContractReleaseSnapshot,
  ReleaseSnapshotAsset as ContractReleaseSnapshotAsset,
  ReleaseSnapshot,
  ReleaseSnapshotAsset,
} from "@worlddock/contract/releases";
