import type {
  WorldAsset,
  WorldAssetKind,
  WorldPackage,
} from "@worlddock/domain";

type FixtureEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_WORLD_DOCK_FIXTURES?: string;
};

export function canUseFixtures(env: FixtureEnvironment = process.env) {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_WORLD_DOCK_FIXTURES === "1";
}

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
  authToken?: string;
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

export type UpdateWorldInput = Partial<CreateWorldInput> & {
  status?: "draft" | "unpublished" | "published";
  visibility?: "private" | "public";
  maturity?: number;
};

export type WorldDraftGenerationInput = {
  inspiration: string;
  name?: string;
  type?: string;
  styleKw?: string;
  avoid?: string;
};

export type WorldDraftTool = {
  id: string;
  label: string;
  detail: string;
};

export type WorldCreationDraft = {
  suggestedName: string;
  suggestedType: string;
  shortSummary?: string;
  styles: string[];
  coreSetting: string;
  coreConflict: string;
  directions: string[];
  firstQuestion: string;
  tools: WorldDraftTool[];
};

export type GenerateWorldDraftResponse = {
  draft: WorldCreationDraft;
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
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

export type AgentContextRef = {
  id: string;
  kind: "world" | "archive" | "seed" | "conflict";
  title: string;
  excerpt: string;
  targetId?: string;
  level: "manifest" | "card" | "brief" | "detail" | "source_fragment" | "release_delta";
  source: "initial" | "tool";
};

export type AgentEventBase = {
  id: string;
  runId: string;
  sequence: number;
  createdAt: string;
};

export type AgentEvent =
  | (AgentEventBase & { type: "run.started"; payload: { runId: string } })
  | (AgentEventBase & { type: "pi.session.started"; payload: { piSessionId: string } })
  | (AgentEventBase & { type: "context.used"; payload: { contextRef: AgentContextRef; contextItemId?: string } })
  | (AgentEventBase & { type: "message.delta"; payload: { text: string } })
  | (AgentEventBase & { type: "tool.requested"; payload: { toolCall: { id: string; name: string; arguments: Record<string, unknown> } } })
  | (AgentEventBase & { type: "tool.completed"; payload: { toolCallId: string; result: Record<string, unknown> } })
  | (AgentEventBase & { type: "suggestion.created"; payload: { suggestionId: string; suggestion: any } })
  | (AgentEventBase & { type: "run.completed"; payload: { tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } } })
  | (AgentEventBase & { type: "run.failed"; payload: { code: string; message: string } })
  | (AgentEventBase & { type: "run.cancelled"; payload: { reason?: string } });

export type SaveAgentSuggestionResponse = {
  suggestion?: {
    savedAssetId?: string | null;
    asset?: WorldAsset;
    savedAsset?: WorldAsset;
    [key: string]: unknown;
  };
  asset?: WorldAsset;
  savedAsset?: WorldAsset;
};

export type ExportSummary = {
  id: string;
  kind: "world";
  status: "ready";
  createdAt: string;
};

export type HubConnection = {
  hubUrl: string;
  tokenPrefix: string;
};

export type HubConnectionResponse = {
  connection: HubConnection | null;
};

export type SaveHubConnectionInput = {
  hubUrl: string;
  token: string;
};

export type PushWorldReleaseInput = {
  owner: string;
  slug: string;
  note?: string;
  selectedAssetIds: string[];
  allowSecretFindings?: boolean;
};

export type PushWorldReleaseResponse = {
  repository: {
    owner: string;
    slug: string;
  };
  release: {
    id: string;
    version: string;
    url: string;
  };
};

export async function listWorlds(options: ApiClientOptions = {}) {
  return requestJson("/v1/worlds", {
    method: "GET",
    ...options,
  });
}

export async function generateWorldDraft(
  input: WorldDraftGenerationInput,
  options: ApiClientOptions = {},
): Promise<GenerateWorldDraftResponse> {
  return requestJson("/v1/world-drafts", {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function createWorld(input: CreateWorldInput, options: ApiClientOptions = {}) {
  return requestJson("/v1/worlds", {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function updateWorld(worldId: string, input: UpdateWorldInput, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}`, {
    method: "PATCH",
    body: input,
    ...options,
  });
}

export async function deleteWorld(worldId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}`, {
    method: "DELETE",
    ...options,
  });
}

export async function duplicateWorld(worldId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/duplicate`, {
    method: "POST",
    ...options,
  });
}

export async function exportWorldPackage(worldId: string, options: ApiClientOptions = {}): Promise<{ export: ExportSummary }> {
  return requestJson(`/v1/worlds/${worldId}/export`, {
    method: "POST",
    ...options,
  });
}

export async function getWorldExport(exportId: string, options: ApiClientOptions = {}): Promise<{ export: ExportSummary; package: WorldPackage }> {
  return requestJson(`/v1/exports/${exportId}`, {
    method: "GET",
    ...options,
  });
}

export async function importWorldPackage(input: WorldPackage, options: ApiClientOptions = {}) {
  return requestJson("/v1/worlds/import", {
    method: "POST",
    body: { package: input },
    ...options,
  });
}

export async function getHubConnection(options: ApiClientOptions = {}): Promise<HubConnectionResponse> {
  return requestJson("/v1/connections/hub", {
    method: "GET",
    ...options,
  });
}

export async function saveHubConnection(
  input: SaveHubConnectionInput,
  options: ApiClientOptions = {},
): Promise<HubConnectionResponse> {
  return requestJson("/v1/connections/hub", {
    method: "PUT",
    body: input,
    ...options,
  });
}

export async function deleteHubConnection(options: ApiClientOptions = {}): Promise<HubConnectionResponse> {
  return requestJson("/v1/connections/hub", {
    method: "DELETE",
    ...options,
  });
}

export async function testHubConnection(options: ApiClientOptions = {}): Promise<{ ok: true }> {
  return requestJson("/v1/connections/hub/test", {
    method: "POST",
    ...options,
  });
}

export async function pushWorldRelease(
  worldId: string,
  input: PushWorldReleaseInput,
  options: ApiClientOptions = {},
): Promise<PushWorldReleaseResponse> {
  return requestJson(`/v1/worlds/${worldId}/push`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listWorldAssets(
  worldId: string,
  options: ApiClientOptions & { kind?: WorldAssetKind; q?: string; cursor?: string } = {},
): Promise<{ assets: WorldAsset[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (options.kind) params.set("kind", options.kind);
  if (options.q) params.set("q", options.q);
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return requestJson(`/v1/worlds/${worldId}/assets${query ? `?${query}` : ""}`, {
    method: "GET",
    ...options,
  });
}

export async function createWorldAsset(
  worldId: string,
  input: CreateWorldAssetInput,
  options: ApiClientOptions = {},
): Promise<{ asset: WorldAsset }> {
  return requestJson(`/v1/worlds/${worldId}/assets`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function updateWorldAsset(
  worldId: string,
  assetId: string,
  input: Partial<Omit<CreateWorldAssetInput, "kind">>,
  options: ApiClientOptions = {},
): Promise<{ asset: WorldAsset }> {
  return requestJson(`/v1/worlds/${worldId}/assets/${assetId}`, {
    method: "PATCH",
    body: input,
    ...options,
  });
}

export async function deleteWorldAsset(worldId: string, assetId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/assets/${assetId}`, {
    method: "DELETE",
    ...options,
  });
}

export async function reorderWorldAssets(worldId: string, assetIds: string[], options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/assets/reorder`, {
    method: "POST",
    body: { assetIds },
    ...options,
  });
}

export async function relateWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions = {},
) {
  return requestJson(`/v1/worlds/${worldId}/assets/${sourceAssetId}/relations`, {
    method: "POST",
    body: { targetAssetId },
    ...options,
  });
}

export async function unrelateWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions = {},
) {
  return requestJson(`/v1/worlds/${worldId}/assets/${sourceAssetId}/relations/${targetAssetId}`, {
    method: "DELETE",
    ...options,
  });
}

export async function createArchiveEntry(
  worldId: string,
  input: CreateArchiveEntryInput,
  options: ApiClientOptions = {},
) {
  return requestJson(`/v1/worlds/${worldId}/archive`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listArchiveEntries(worldId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/archive`, {
    method: "GET",
    ...options,
  });
}

export async function listStorySeeds(worldId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/seeds`, {
    method: "GET",
    ...options,
  });
}

export async function createStorySeed(worldId: string, input: CreateStorySeedInput, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/seeds`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listConflicts(worldId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/conflicts`, {
    method: "GET",
    ...options,
  });
}

export async function createConflict(worldId: string, input: CreateConflictInput, options: ApiClientOptions = {}) {
  return requestJson(`/v1/worlds/${worldId}/conflicts`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function createAgentRun(
  worldId: string,
  input: { prompt: string },
  options: ApiClientOptions = {},
) {
  return requestJson(`/v1/worlds/${worldId}/agent-runs`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function fetchAgentEvents(runId: string, options: ApiClientOptions = {}): Promise<AgentEvent[]> {
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

export async function cancelAgentRun(runId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/agent-runs/${runId}/cancel`, {
    method: "POST",
    ...options,
  });
}

export async function saveAgentSuggestion(
  suggestionId: string,
  options: ApiClientOptions = {},
): Promise<SaveAgentSuggestionResponse> {
  return requestJson<SaveAgentSuggestionResponse>(`/v1/agent-suggestions/${suggestionId}/save`, {
    method: "POST",
    ...options,
  });
}

export async function discardAgentSuggestion(suggestionId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/agent-suggestions/${suggestionId}/discard`, {
    method: "POST",
    ...options,
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
    headers: buildHeaders(options),
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

async function requestJson<T>(
  path: string,
  options: ApiClientOptions & {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  },
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const url = `${options.baseUrl ?? getApiBaseUrl()}${path}`;
  const headers = buildHeaders(options);

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetcher(url, {
    method: options.method,
    headers,
    signal: options.signal,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const payload = await readJsonPayload(response);
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

function buildHeaders(options: Pick<ApiClientOptions, "authToken">) {
  const headers: Record<string, string> = {};
  if (options.authToken?.trim()) {
    headers.authorization = `Bearer ${options.authToken.trim()}`;
  }
  return headers;
}

async function readJsonPayload(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getApiBaseUrl() {
  return firstConfigured(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
  ) ?? "http://localhost:4000";
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}
