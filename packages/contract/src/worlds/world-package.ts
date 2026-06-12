import { z } from "zod";

export const worldPackageSchema = z.object({
  format: z.literal("worlddock.world-package.v1"),
  exportedAt: z.string().datetime(),
  world: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string()),
    maturity: z.number().int().min(0).max(100),
  }),
  assets: z.array(z.object({
    kind: z.enum(["setting", "seed", "conflict"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    body: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })),
  releases: z.array(z.object({
    version: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.string().datetime(),
  })).default([]),
});

export type WorldPackage = z.infer<typeof worldPackageSchema>;
