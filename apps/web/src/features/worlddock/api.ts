import type { WorldAsset, WorldAssetKind } from "@worlddock/domain";

export type AccessTokenScope = "world:read" | "world:write" | "repository:push";

export const WORLD_DOCK_SESSION_TOKEN_KEY = "worlddock.sessionToken";

type FixtureEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_WORLD_DOCK_FIXTURES?: string;
};

type SessionTokenStorage = Pick<Storage, "getItem">;

export function canUseFixtures(env: FixtureEnvironment = process.env) {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_WORLD_DOCK_FIXTURES === "1";
}

export function readStoredSessionToken(storage: SessionTokenStorage | null = getBrowserSessionStorage()) {
  return storage?.getItem(WORLD_DOCK_SESSION_TOKEN_KEY) ?? "";
}

export type AccessTokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export class WorldDockApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorldDockApiError";
  }
}

export type ApiClientOptions = {
  sessionToken: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
};

export type CreateWorldInput = {
  name: string;
  type: string;
  summary: string;
  tags: string[];
  mode: "cloud" | "local";
};

export type CreateWorldAssetInput = {
  kind: WorldAssetKind;
  title: string;
  category?: string;
  summary: string;
  body?: string;
  payload?: Record<string, unknown>;
  position?: number;
};

export type CreateArchiveEntryInput = {
  title: string;
  category: string;
  summary: string;
  body: string;
  relations?: string[];
};

export type CreateStorySeedInput = {
  title: string;
  hook: string;
  trigger?: string;
  conflict: string;
  protagonists?: string;
  questions?: string[];
};

export type CreateConflictInput = {
  title: string;
  summary: string;
  body: string;
  related?: string[];
  derivedSeeds?: string[];
};

export type AgentRunMode = "expand" | "challenge" | "fork" | "polish";

export type AgentEvent = {
  type: string;
  payload: any;
  [key: string]: any;
};

export type BillingBalance = {
  userId: string;
  currency: "CNY";
  balanceCents: number;
  lowBalanceThresholdCents: number;
  updatedAt: string;
};

export type UsageLedgerEntry = {
  id: string;
  accountId: string;
  userId: string;
  agentRunId?: string | null;
  type: string;
  amountCents: number;
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  reason?: string | null;
  createdAt: string;
};

export type BillingPlaceholderIntent = {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: "captured";
  createdAt: string;
};

export type BillingUsage = {
  balance: BillingBalance;
  lastAgentRun: {
    agentRunId: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    costCents: number;
    createdAt: string;
  } | null;
  entries: UsageLedgerEntry[];
  placeholderIntents?: BillingPlaceholderIntent[];
};

export type PublishWorldInput = {
  releaseNote: string;
  license: string;
};

export type LocalPushInput = PublishWorldInput & {
  name: string;
  summary: string;
  tags: string[];
  snapshot: {
    world: { name: string; type: string; summary: string; tags: string[]; maturity: number };
    archiveEntries: unknown[];
    storySeeds: unknown[];
    conflicts: unknown[];
  };
};

export type ReleaseChange = {
  assetId: string;
  kind: "added" | "changed" | "removed";
  title: string;
  beforeHash?: string;
  afterHash?: string;
};

export type ReleasePreflight = {
  ok: boolean;
  checks: Array<{
    code: "assets" | "license" | "release_note" | "moderation" | "entitlement";
    ok: boolean;
    message: string;
  }>;
  changes: ReleaseChange[];
};

export type ReportRepositoryInput = {
  reason: "spam" | "sensitive_content" | "abuse" | "copyright" | "other";
  detail?: string;
};

export async function createAccessToken(
  input: { name: string; scopes: AccessTokenScope[] },
  options: ApiClientOptions,
): Promise<{ token: string; accessToken: AccessTokenSummary }> {
  return requestJson("/v1/access-tokens", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function listAccessTokens(
  options: ApiClientOptions,
): Promise<{ accessTokens: AccessTokenSummary[] }> {
  return requestJson("/v1/access-tokens", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function revokeAccessToken(
  tokenId: string,
  options: ApiClientOptions,
): Promise<{ accessToken: AccessTokenSummary }> {
  return requestJson(`/v1/access-tokens/${tokenId}`, {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function getBillingBalance(options: ApiClientOptions): Promise<{ balance: BillingBalance }> {
  return requestJson("/v1/billing/balance", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getBillingUsage(options: ApiClientOptions): Promise<{ usage: BillingUsage }> {
  return requestJson("/v1/billing/usage", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function captureBillingPlaceholderIntent(
  input: { plan: "creator" | "studio" | "team" },
  options: ApiClientOptions,
): Promise<{ intent: BillingPlaceholderIntent }> {
  return requestJson("/v1/billing/placeholder-intents", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function listWorlds(options: ApiClientOptions) {
  return requestJson("/v1/worlds", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function createWorld(input: CreateWorldInput, options: ApiClientOptions) {
  return requestJson("/v1/worlds", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function deleteWorld(worldId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}`, {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function duplicateWorld(worldId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/duplicate`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function listWorldAssets(
  worldId: string,
  options: ApiClientOptions & { kind?: WorldAssetKind; q?: string; cursor?: string },
): Promise<{ assets: WorldAsset[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (options.kind) params.set("kind", options.kind);
  if (options.q) params.set("q", options.q);
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return requestJson(`/v1/worlds/${worldId}/assets${query ? `?${query}` : ""}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function createWorldAsset(
  worldId: string,
  input: CreateWorldAssetInput,
  options: ApiClientOptions,
): Promise<{ asset: WorldAsset }> {
  return requestJson(`/v1/worlds/${worldId}/assets`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function updateWorldAsset(
  worldId: string,
  assetId: string,
  input: Partial<Omit<CreateWorldAssetInput, "kind">>,
  options: ApiClientOptions,
): Promise<{ asset: WorldAsset }> {
  return requestJson(`/v1/worlds/${worldId}/assets/${assetId}`, {
    method: "PATCH",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function deleteWorldAsset(worldId: string, assetId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/assets/${assetId}`, {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function reorderWorldAssets(worldId: string, assetIds: string[], options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/assets/reorder`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: { assetIds },
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function relateWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions,
) {
  return requestJson(`/v1/worlds/${worldId}/assets/${sourceAssetId}/relations`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: { targetAssetId },
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function createArchiveEntry(
  worldId: string,
  input: CreateArchiveEntryInput,
  options: ApiClientOptions,
) {
  return requestJson(`/v1/worlds/${worldId}/archive`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function listArchiveEntries(worldId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/archive`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function listStorySeeds(worldId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/seeds`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function createStorySeed(worldId: string, input: CreateStorySeedInput, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/seeds`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function listConflicts(worldId: string, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/conflicts`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function createConflict(worldId: string, input: CreateConflictInput, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/conflicts`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function publishWorld(worldId: string, input: PublishWorldInput, options: ApiClientOptions) {
  return requestJson(`/v1/worlds/${worldId}/publish`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function previewWorldRelease(
  worldId: string,
  input: Partial<PublishWorldInput>,
  options: ApiClientOptions,
): Promise<{ preflight: ReleasePreflight }> {
  return requestJson(`/v1/worlds/${worldId}/releases/preview`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function listPublicRepositories(options: ApiClientOptions) {
  return requestJson("/v1/repositories", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export type RepositorySearchOptions = {
  tags?: string[];
  sort?: "relevance" | "stars" | "forks" | "updated";
};

export async function searchPublicRepositories(query: string, options: ApiClientOptions & RepositorySearchOptions) {
  const params = new URLSearchParams({ q: query });
  for (const tag of options.tags ?? []) params.append("tag", tag);
  if (options.sort && options.sort !== "relevance") params.set("sort", options.sort);

  return requestJson(`/v1/repositories/search?${params.toString()}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getPublicRepository(owner: string, slug: string, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${owner}/${slug}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function listRepositoryReleases(repositoryId: string, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/releases`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function rollbackRelease(releaseId: string, options: ApiClientOptions) {
  return requestJson(`/v1/releases/${releaseId}/rollback`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function starRepository(repositoryId: string, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/star`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function unstarRepository(repositoryId: string, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/star`, {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function forkRepository(repositoryId: string, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/fork`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getForkUpstreamDiff(forkId: string, options: ApiClientOptions) {
  return requestJson(`/v1/forks/${forkId}/upstream-diff`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function syncFork(forkId: string, options: ApiClientOptions) {
  return requestJson(`/v1/forks/${forkId}/sync`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function detachFork(forkId: string, options: ApiClientOptions) {
  return requestJson(`/v1/forks/${forkId}/detach`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function reportRepository(repositoryId: string, input: ReportRepositoryInput, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/reports`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function localPushRepository(input: LocalPushInput, options: ApiClientOptions) {
  return requestJson("/v1/repositories/local-push", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function createAgentRun(
  worldId: string,
  input: { prompt: string; mode: AgentRunMode },
  options: ApiClientOptions,
) {
  return requestJson(`/v1/worlds/${worldId}/agent-runs`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function fetchAgentEvents(runId: string, options: ApiClientOptions): Promise<AgentEvent[]> {
  const response = await openAgentEventResponse(runId, options);
  const text = await response.text();
  return parseSseEvents(text);
}

export async function streamAgentEvents(
  runId: string,
  options: ApiClientOptions,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const response = await openAgentEventResponse(runId, options);

  if (!response.body) {
    for (const event of parseSseEvents(await response.text())) onEvent(event);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundary = findSseBoundary(buffer);
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed);
      buffer = buffer.slice(boundary + getBoundaryLength(buffer, boundary));
      boundary = findSseBoundary(buffer);
    }

    if (done) break;
  }

  const trailing = parseSseBlock(buffer);
  if (trailing) onEvent(trailing);
}

export async function cancelAgentRun(runId: string, options: ApiClientOptions) {
  return requestJson(`/v1/agent-runs/${runId}/cancel`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function saveAgentSuggestion(suggestionId: string, options: ApiClientOptions) {
  return requestJson(`/v1/agent-suggestions/${suggestionId}/save`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

export async function discardAgentSuggestion(suggestionId: string, options: ApiClientOptions) {
  return requestJson(`/v1/agent-suggestions/${suggestionId}/discard`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
  });
}

function parseSseEvents(text: string): AgentEvent[] {
  return text
    .split(/\r?\n\r?\n+/)
    .map(parseSseBlock)
    .filter((event): event is AgentEvent => Boolean(event));
}

async function openAgentEventResponse(runId: string, options: ApiClientOptions): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${options.baseUrl ?? getApiBaseUrl()}/v1/agent-runs/${runId}/events`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.sessionToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Agent event stream failed with ${response.status}`);
  }

  return response;
}

function parseSseBlock(block: string): AgentEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");

  return data ? JSON.parse(data) as AgentEvent : null;
}

function findSseBoundary(text: string) {
  const lf = text.indexOf("\n\n");
  const crlf = text.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function getBoundaryLength(text: string, boundary: number) {
  return text.startsWith("\r\n\r\n", boundary) ? 4 : 2;
}

function getBrowserSessionStorage(): SessionTokenStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

async function requestJson<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    sessionToken: string;
    body?: unknown;
    fetcher?: typeof fetch;
    baseUrl?: string;
    signal?: AbortSignal;
  },
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const url = `${options.baseUrl ?? getApiBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.sessionToken}`,
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetcher(url, {
    method: options.method,
    headers,
    signal: options.signal,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new WorldDockApiError(
      payload?.message ?? `WorldDock API request failed with ${response.status}`,
      response.status,
      payload?.code,
      payload?.details,
    );
  }

  return payload as T;
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}
