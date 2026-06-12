import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
  details: z.unknown().optional(),
});

export const appErrorKindSchema = z.enum([
  "save-failed",
  "network-error",
  "model-unavailable",
  "insufficient-balance",
  "permission-denied",
  "local-runtime-disconnected",
]);

export type ApiError = z.infer<typeof apiErrorSchema>;
export type AppErrorKind = z.infer<typeof appErrorKindSchema>;
