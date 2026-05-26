import { z } from "zod";

export const storagePurposeSchema = z.enum(["avatar", "world_cover", "release_attachment", "import_export"]);
export const storageVisibilitySchema = z.enum(["private", "public"]);
export const storageObjectStatusSchema = z.enum(["pending", "attached", "orphaned", "deleted"]);

export const createStorageUploadSchema = z.object({
  purpose: storagePurposeSchema,
  filename: z.string().min(1).max(160),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(1),
  visibility: storageVisibilitySchema.default("private"),
  worldId: z.string().min(1).optional(),
  repositoryId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
});

export type StoragePurpose = z.infer<typeof storagePurposeSchema>;
export type StorageVisibility = z.infer<typeof storageVisibilitySchema>;
export type StorageObjectStatus = z.infer<typeof storageObjectStatusSchema>;
export type CreateStorageUploadInput = z.infer<typeof createStorageUploadSchema>;
