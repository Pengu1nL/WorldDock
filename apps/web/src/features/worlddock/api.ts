import type {
  WorldAsset,
  WorldAssetKind,
  WorldPackage,
} from "@worlddock/domain";
import type {
  AgentSession,
  AgentSessionContextItem,
  AgentSessionKind,
  AgentSessionMessage,
  AgentSessionStatus,
  ConsistencyIssue,
  ConsistencyIssueStatus,
  OfficialWorldAsset,
  OfficialWorldAssetStatus,
  OfficialWorldAssetType,
  PotentialAsset,
  PotentialAssetStatus,
  WorldAssetDetail,
  WorldAssetPatch,
  WorldAssetPatchBatch,
} from "@worlddock/contract";

export type {
  AgentSession,
  AgentSessionContextItem,
  AgentSessionMessage,
  ConsistencyIssue,
  OfficialWorldAsset,
  PotentialAsset,
  WorldAssetDetail,
  WorldAssetPatch,
  WorldAssetPatchBatch,
} from "@worlddock/contract";

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

export type AgentSessionRunEvent = AgentEvent | (AgentEventBase & {
  type: "potential_asset.detected";
  payload: {
    potentialAssetId: string;
    potentialAsset?: PotentialAsset;
    [key: string]: unknown;
  };
}) | (AgentEventBase & {
  type: "asset.patch.applied";
  payload: {
    sessionId: string;
    assetId: string;
    patchId: string;
  };
}) | (AgentEventBase & {
  type: "consistency.issue.created";
  payload: {
    issueId: string;
    worldId: string;
  };
});

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

export type AgentSessionDetail = {
  session: AgentSession;
  subjects: AgentSessionDetailSubject[];
  contextItems: AgentSessionContextItem[];
  messages: AgentSessionMessage[];
};

export type AgentSessionDetailSubject = {
  id: string;
  sessionId: string;
  subjectKind: AgentSession["subjects"][number]["kind"];
  subjectId: string;
  role: AgentSession["subjects"][number]["role"];
  title?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentSessionInput = {
  kind: AgentSessionKind;
  title?: string;
  current?: boolean;
  metadata?: Record<string, unknown>;
  subjectAssetId?: string;
  issueId?: string;
};

export type ListAgentSessionsOptions = ApiClientOptions & {
  kind?: AgentSessionKind;
  status?: AgentSessionStatus;
  current?: boolean;
  includeArchived?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type AgentSessionRun = {
  id: string;
  [key: string]: unknown;
};

export type ListPotentialAssetsOptions = ApiClientOptions & {
  status?: PotentialAssetStatus;
  type?: OfficialWorldAssetType;
  cursor?: string;
  limit?: number;
};

export type PromotePotentialAssetInput = {
  name?: string;
  markdown?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type PromotePotentialAssetResponse = WorldAssetDetail & {
  potentialAsset: PotentialAsset;
  depositionRun: AgentSessionRun;
};

export type ListOfficialAssetsOptions = ApiClientOptions & {
  type?: OfficialWorldAssetType;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type CreateOfficialAssetInput = {
  type: OfficialWorldAssetType;
  name: string;
  summary: string;
  markdown?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type UpdateOfficialAssetInput = {
  name?: string;
  summary?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: OfficialWorldAssetStatus;
};

export type ApplyOfficialAssetPatchInput = {
  sessionId: string;
  afterMarkdown: string;
  reason?: string;
};

export type ListConsistencyIssuesOptions = ApiClientOptions & {
  status?: ConsistencyIssueStatus;
  cursor?: string;
  limit?: number;
};

export type ApplyConsistencyPatchBatchInput = {
  sessionId: string;
  patches: Array<{
    assetId: string;
    afterMarkdown: string;
    reason?: string;
  }>;
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

export async function createAgentSession(
  worldId: string,
  input: CreateAgentSessionInput,
  options: ApiClientOptions = {},
): Promise<{ session: AgentSession }> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listAgentSessions(
  worldId: string,
  options: ListAgentSessionsOptions = {},
): Promise<{ sessions: AgentSession[]; nextCursor: string | null }> {
  return requestJson(withQueryParams(`/v1/worlds/${worldId}/agent-sessions`, {
    kind: options.kind,
    status: options.status,
    current: options.current,
    includeArchived: options.includeArchived,
    q: options.q,
    cursor: options.cursor,
    limit: options.limit,
  }), {
    method: "GET",
    ...options,
  });
}

export async function getAgentSession(
  worldId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<AgentSessionDetail> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions/${sessionId}`, {
    method: "GET",
    ...options,
  });
}

export async function archiveAgentSession(
  worldId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<{ session: AgentSession }> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions/${sessionId}/archive`, {
    method: "POST",
    ...options,
  });
}

export async function setCurrentAgentSession(
  worldId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<{ session: AgentSession }> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions/${sessionId}/current`, {
    method: "POST",
    ...options,
  });
}

export async function createAgentSessionRun(
  worldId: string,
  sessionId: string,
  input: { prompt: string },
  options: ApiClientOptions = {},
): Promise<{ run: AgentSessionRun }> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions/${sessionId}/runs`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listPotentialAssets(
  worldId: string,
  options: ListPotentialAssetsOptions = {},
): Promise<{ potentialAssets: PotentialAsset[]; nextCursor: string | null }> {
  return requestJson(withQueryParams(`/v1/worlds/${worldId}/potential-assets`, {
    status: options.status,
    type: options.type,
    cursor: options.cursor,
    limit: options.limit,
  }), {
    method: "GET",
    ...options,
  });
}

export async function listPotentialAssetsForSession(
  worldId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<{ potentialAssets: PotentialAsset[]; nextCursor: string | null }> {
  return requestJson(`/v1/worlds/${worldId}/agent-sessions/${sessionId}/potential-assets`, {
    method: "GET",
    ...options,
  });
}

export async function dismissPotentialAsset(
  worldId: string,
  potentialAssetId: string,
  options: ApiClientOptions = {},
): Promise<{ potentialAsset: PotentialAsset }> {
  return requestJson(`/v1/worlds/${worldId}/potential-assets/${potentialAssetId}/dismiss`, {
    method: "POST",
    ...options,
  });
}

export async function promotePotentialAsset(
  worldId: string,
  potentialAssetId: string,
  input: PromotePotentialAssetInput = {},
  options: ApiClientOptions = {},
): Promise<PromotePotentialAssetResponse> {
  return requestJson(`/v1/worlds/${worldId}/potential-assets/${potentialAssetId}/promote`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listOfficialAssets(
  worldId: string,
  options: ListOfficialAssetsOptions = {},
): Promise<{ assets: OfficialWorldAsset[]; nextCursor: string | null }> {
  return requestJson(withQueryParams(`/v1/worlds/${worldId}/official-assets`, {
    type: options.type,
    q: options.q,
    cursor: options.cursor,
    limit: options.limit,
  }), {
    method: "GET",
    ...options,
  });
}

export async function getOfficialAsset(
  worldId: string,
  assetId: string,
  options: ApiClientOptions = {},
): Promise<WorldAssetDetail> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}`, {
    method: "GET",
    ...options,
  });
}

export async function createOfficialAsset(
  worldId: string,
  input: CreateOfficialAssetInput,
  options: ApiClientOptions = {},
): Promise<WorldAssetDetail> {
  return requestJson(`/v1/worlds/${worldId}/official-assets`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function updateOfficialAsset(
  worldId: string,
  assetId: string,
  input: UpdateOfficialAssetInput,
  options: ApiClientOptions = {},
): Promise<WorldAssetDetail> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}`, {
    method: "PATCH",
    body: input,
    ...options,
  });
}

export async function createAssetEditSession(
  worldId: string,
  assetId: string,
  input: { title?: string } = {},
  options: ApiClientOptions = {},
): Promise<AgentSessionDetail> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}/edit-sessions`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function applyOfficialAssetPatch(
  worldId: string,
  assetId: string,
  input: ApplyOfficialAssetPatchInput,
  options: ApiClientOptions = {},
): Promise<{ patch: WorldAssetPatch }> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}/patches`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function listOfficialAssetPatches(
  worldId: string,
  assetId: string,
  options: ApiClientOptions = {},
): Promise<{ patches: WorldAssetPatch[] }> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}/patches`, {
    method: "GET",
    ...options,
  });
}

export async function revertOfficialAssetPatch(
  worldId: string,
  assetId: string,
  patchId: string,
  options: ApiClientOptions = {},
): Promise<{ patch: WorldAssetPatch }> {
  return requestJson(`/v1/worlds/${worldId}/official-assets/${assetId}/patches/${patchId}/revert`, {
    method: "POST",
    ...options,
  });
}

export async function runConsistencyCheck(
  worldId: string,
  options: ApiClientOptions = {},
): Promise<{ issues: ConsistencyIssue[] }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/check`, {
    method: "POST",
    ...options,
  });
}

export async function listConsistencyIssues(
  worldId: string,
  options: ListConsistencyIssuesOptions = {},
): Promise<{ issues: ConsistencyIssue[]; nextCursor: string | null }> {
  return requestJson(withQueryParams(`/v1/worlds/${worldId}/consistency-issues`, {
    status: options.status,
    cursor: options.cursor,
    limit: options.limit,
  }), {
    method: "GET",
    ...options,
  });
}

export async function getConsistencyIssue(
  worldId: string,
  issueId: string,
  options: ApiClientOptions = {},
): Promise<{ issue: ConsistencyIssue }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}`, {
    method: "GET",
    ...options,
  });
}

export async function ignoreConsistencyIssue(
  worldId: string,
  issueId: string,
  options: ApiClientOptions = {},
): Promise<{ issue: ConsistencyIssue }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}/ignore`, {
    method: "POST",
    ...options,
  });
}

export async function reopenConsistencyIssue(
  worldId: string,
  issueId: string,
  options: ApiClientOptions = {},
): Promise<{ issue: ConsistencyIssue }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}/reopen`, {
    method: "POST",
    ...options,
  });
}

export async function createConsistencyRepairSession(
  worldId: string,
  issueId: string,
  input: { title?: string } = {},
  options: ApiClientOptions = {},
): Promise<AgentSessionDetail> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}/repair-sessions`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function applyConsistencyPatchBatch(
  worldId: string,
  issueId: string,
  input: ApplyConsistencyPatchBatchInput,
  options: ApiClientOptions = {},
): Promise<{ batch: WorldAssetPatchBatch }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}/patch-batches`, {
    method: "POST",
    body: input,
    ...options,
  });
}

export async function revertConsistencyPatchBatch(
  worldId: string,
  issueId: string,
  batchId: string,
  options: ApiClientOptions = {},
): Promise<{ batch: WorldAssetPatchBatch }> {
  return requestJson(`/v1/worlds/${worldId}/consistency-issues/${issueId}/patch-batches/${batchId}/revert`, {
    method: "POST",
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
  await streamSseEvents<AgentEvent>(response, onEvent);
}

export async function streamAgentSessionRunEvents(
  runId: string,
  options: ApiClientOptions,
  onEvent: (event: AgentSessionRunEvent) => void,
): Promise<void> {
  const response = await openAgentSessionRunEventResponse(runId, options);
  await streamSseEvents<AgentSessionRunEvent>(response, onEvent);
}

async function streamSseEvents<TEvent extends AgentEventBase>(response: Response, onEvent: (event: TEvent) => void): Promise<void> {
  if (!response.body) {
    for (const event of parseSseEvents<TEvent>(await response.text())) onEvent(event);
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
      const parsed = parseSseBlock<TEvent>(block);
      if (parsed) onEvent(parsed);
      buffer = buffer.slice(boundary + getBoundaryLength(buffer, boundary));
      boundary = findSseBoundary(buffer);
    }

    if (done) break;
  }

  const trailing = parseSseBlock<TEvent>(buffer);
  if (trailing) onEvent(trailing);
}

export async function cancelAgentRun(runId: string, options: ApiClientOptions = {}) {
  return requestJson(`/v1/agent-runs/${runId}/cancel`, {
    method: "POST",
    ...options,
  });
}

function parseSseEvents<TEvent extends AgentEventBase = AgentEvent>(text: string): TEvent[] {
  return text
    .split(/\r?\n\r?\n+/)
    .map((block) => parseSseBlock<TEvent>(block))
    .filter((event): event is TEvent => Boolean(event));
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

async function openAgentSessionRunEventResponse(runId: string, options: ApiClientOptions): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${options.baseUrl ?? getApiBaseUrl()}/v1/agent-session-runs/${runId}/events`, {
    method: "GET",
    headers: buildHeaders(options),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Agent session run event stream failed with ${response.status}`);
  }

  return response;
}

function parseSseBlock<TEvent extends AgentEventBase = AgentEvent>(block: string): TEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");

  return data ? JSON.parse(data) as TEvent : null;
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

function withQueryParams(path: string, params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
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
