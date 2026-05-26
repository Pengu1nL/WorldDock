import { z } from "zod";

export const licenseSchema = z.enum([
  "all-rights-reserved",
  "non-commercial-attribution",
  "free-fork-attribution",
  "commercial-attribution",
  "no-fork",
]);

export const releaseSchema = z.object({
  version: z.string().min(1),
  updated: z.string().min(1),
  note: z.string().min(1),
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
  source: z.enum(["cloud-publish", "local-push"]),
});

export const publicRepositorySchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  readme: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)),
  stars: z.number().int().min(0),
  forks: z.number().int().min(0),
  seeds: z.number().int().min(0).optional(),
  maturity: z.number().int().min(0).max(100).optional(),
  updated: z.string().min(1),
  version: z.string().min(1),
  visibility: z.literal("public"),
  license: licenseSchema,
  forkedFrom: z.string().min(1).optional(),
  releases: z.array(releaseSchema).default([]),
});

export type PublicRepository = z.infer<typeof publicRepositorySchema>;
export type Release = z.infer<typeof releaseSchema>;
