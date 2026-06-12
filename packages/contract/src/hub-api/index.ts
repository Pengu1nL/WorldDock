import { z } from "zod";
import { releaseSnapshotSchema } from "../releases";

export const hubPersonalAccessTokenScopeSchema = z.enum(["repo:push", "repo:pull"]);
export type HubPersonalAccessTokenScope = z.infer<typeof hubPersonalAccessTokenScopeSchema>;

export const repositoryRefSchema = z.object({
  owner: z.string().min(1),
  slug: z.string().min(1),
});
export type RepositoryRef = z.infer<typeof repositoryRefSchema>;

export const pushReleaseRequestSchema = z.object({
  snapshot: releaseSnapshotSchema,
  note: z.string().max(4000).default(""),
});
export type PushReleaseRequest = z.infer<typeof pushReleaseRequestSchema>;

export const pushReleaseResponseSchema = z.object({
  repository: repositoryRefSchema,
  release: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    url: z.string().url(),
  }),
});
export type PushReleaseResponse = z.infer<typeof pushReleaseResponseSchema>;

export const pullRepositoryResponseSchema = z.object({
  repository: repositoryRefSchema.extend({
    name: z.string().min(1),
    summary: z.string().default(""),
  }),
  snapshot: releaseSnapshotSchema,
}).superRefine((value, context) => {
  if (
    value.repository.owner !== value.snapshot.repository.owner
    || value.repository.slug !== value.snapshot.repository.slug
    || value.repository.name !== value.snapshot.repository.name
  ) {
    context.addIssue({
      code: "custom",
      message: "Repository metadata must match the release snapshot repository.",
      path: ["repository"],
    });
  }
});
export type PullRepositoryResponse = z.infer<typeof pullRepositoryResponseSchema>;
