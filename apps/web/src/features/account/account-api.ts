const API_BASE_URL = firstConfigured(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
) ?? "http://localhost:4000";

export type AccountProfile = {
  id: string;
  userId: string;
  displayName: string;
  handle: string;
  avatarObjectId: string | null;
  onboardingCompletedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getAccountProfile(sessionToken: string) {
  return requestAccount<{ profile: AccountProfile }>("/v1/account/profile", {
    method: "GET",
    sessionToken,
  });
}

export async function updateAccountProfile(
  sessionToken: string,
  input: { displayName?: string; handle?: string },
) {
  return requestAccount<{ profile: AccountProfile }>("/v1/account/profile", {
    method: "PATCH",
    sessionToken,
    body: input,
  });
}

export async function completeOnboarding(sessionToken: string) {
  return requestAccount<{ profile: AccountProfile }>("/v1/account/onboarding/complete", {
    method: "PATCH",
    sessionToken,
  });
}

async function requestAccount<T>(
  path: string,
  options: { method: string; sessionToken: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      authorization: `Bearer ${options.sessionToken}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.message === "string" ? payload.message : "Account request failed.");
  }
  return response.json() as Promise<T>;
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}
