export type AccessTokenScope = "world:read" | "world:write" | "repository:push";

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

async function requestJson<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "DELETE";
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
    throw new Error(payload?.message ?? `WorldDock API request failed with ${response.status}`);
  }

  return payload as T;
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}
