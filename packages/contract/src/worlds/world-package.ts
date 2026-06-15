import { z } from "zod";
import { officialWorldAssetStatusSchema, officialWorldAssetTypeSchema } from "../assets";

const worldPackageWorldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()),
  maturity: z.number().int().min(0).max(100),
});

export const legacyWorldPackageAssetSchema = z.object({
  kind: z.enum(["setting", "seed", "conflict"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const officialWorldPackageAssetSchema = z.object({
  type: officialWorldAssetTypeSchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  markdown: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status: officialWorldAssetStatusSchema.optional(),
  version: z.number().int().min(1).optional(),
});

export const worldPackageV1Schema = z.object({
  format: z.literal("worlddock.world-package.v1"),
  exportedAt: z.string().datetime(),
  world: worldPackageWorldSchema,
  assets: z.array(legacyWorldPackageAssetSchema),
  releases: z.array(z.object({
    version: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.string().datetime(),
  })).default([]),
});

export const worldPackageV2Schema = z.object({
  format: z.literal("worlddock.world-package.v2"),
  exportedAt: z.string().datetime(),
  world: worldPackageWorldSchema,
  assets: z.array(officialWorldPackageAssetSchema),
  releases: z.array(z.object({
    version: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.string().datetime(),
  })).default([]),
});

export const worldPackageSchema = z.discriminatedUnion("format", [
  worldPackageV1Schema,
  worldPackageV2Schema,
]);

export type WorldPackage = z.infer<typeof worldPackageSchema>;
export type WorldPackageV1 = z.infer<typeof worldPackageV1Schema>;
export type WorldPackageV2 = z.infer<typeof worldPackageV2Schema>;
export type LegacyWorldPackageAsset = z.infer<typeof legacyWorldPackageAssetSchema>;
export type OfficialWorldPackageAsset = z.infer<typeof officialWorldPackageAssetSchema>;
