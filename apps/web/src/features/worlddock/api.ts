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

async function requestJson<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "DELETE";
    sessionToken: string;
    body?: unknown;
    fetcher?: typeof fetch;
    baseUrl?: string;
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
