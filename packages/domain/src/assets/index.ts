import { z } from "zod";

export const worldAssetKindSchema = z.enum(["setting", "seed", "conflict"]);

export const worldAssetSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  kind: worldAssetKindSchema,
  title: z.string().min(1),
  category: z.string().min(1).optional(),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type WorldAssetKind = z.infer<typeof worldAssetKindSchema>;
export type WorldAsset = z.infer<typeof worldAssetSchema>;
