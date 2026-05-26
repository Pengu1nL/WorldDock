import { z } from "zod";

export const worldStatusSchema = z.enum(["draft", "unpublished", "published"]);
export const worldModeSchema = z.enum(["cloud", "local"]);
export const visibilitySchema = z.enum(["private", "public"]);

export const worldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
  maturity: z.number().int().min(0).max(100),
  status: worldStatusSchema,
  visibility: visibilitySchema,
  archive: z.number().int().min(0),
  seeds: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  updated: z.string().min(1),
  mode: worldModeSchema,
  hasUnsaved: z.boolean().optional(),
  hasUnpushed: z.boolean().optional(),
  starred: z.number().int().min(0).optional(),
  forked: z.number().int().min(0).optional(),
  isNew: z.boolean().optional(),
});

export type World = z.infer<typeof worldSchema>;
export type WorldMode = z.infer<typeof worldModeSchema>;
