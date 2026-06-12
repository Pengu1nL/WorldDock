import { z } from "zod";
import { worldPackageSchema } from "../worlds/world-package";

export const contractVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const releaseSnapshotAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["setting", "seed", "conflict"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  contentHash: z.string().min(1).optional(),
});

export const releaseSnapshotSchema = z.object({
  contractVersion: contractVersionSchema,
  package: worldPackageSchema,
  assets: z.array(releaseSnapshotAssetSchema).default([]),
  createdAt: z.string().datetime(),
});

export type ReleaseSnapshot = z.infer<typeof releaseSnapshotSchema>;
export type ReleaseSnapshotAsset = z.infer<typeof releaseSnapshotAssetSchema>;
