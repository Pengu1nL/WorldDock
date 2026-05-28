import { z } from "zod";

export const alphaPersonalAccessTokenScopes = [
  "world:read",
  "world:write",
  "repository:read",
  "billing:read",
] as const;

export const personalAccessTokenScopeSchema = z.enum(alphaPersonalAccessTokenScopes);

export const personalAccessTokenScopeDescriptions = [
  {
    value: "world:read",
    label: "Read worlds",
    description: "List, inspect, and export cloud worlds owned by the token user.",
  },
  {
    value: "world:write",
    label: "Write worlds",
    description: "Create, import, edit, and publish cloud worlds owned by the token user.",
  },
  {
    value: "repository:read",
    label: "Read repositories",
    description: "Pull public repository packages without a local deployment dependency.",
  },
  {
    value: "billing:read",
    label: "Read billing",
    description: "Read Alpha credit balances, entitlements, and usage history.",
  },
] as const;

export const createPersonalAccessTokenSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(personalAccessTokenScopeSchema).min(1),
  expiresAt: z.string().datetime().optional(),
});

export type PersonalAccessTokenScope = z.infer<typeof personalAccessTokenScopeSchema>;
export type CreatePersonalAccessTokenInput = z.infer<typeof createPersonalAccessTokenSchema>;
