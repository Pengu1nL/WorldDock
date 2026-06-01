import { PRODUCT_EVENTS } from "@worlddock/domain";
import type { ProductEventName } from "@worlddock/domain";

export { PRODUCT_EVENTS };
export type { ProductEventName };

const ANONYMOUS_ID_KEY = "worlddock.anonymousId";

type ProductEventContext = Record<string, unknown>;

type ProductEventOptions = {
  fetcher?: typeof fetch;
  baseUrl?: string;
  anonymousId?: string;
  route?: string;
};

function resolveApiBaseUrl(baseUrl?: string) {
  return (firstConfigured(
    baseUrl,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
  ) ?? "http://localhost:4000").replace(/\/$/, "");
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}

function createAnonymousId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function readBrowserAnonymousId() {
  if (typeof window === "undefined") return undefined;

  try {
    const existingAnonymousId = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existingAnonymousId) return existingAnonymousId;

    const anonymousId = createAnonymousId();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
    return anonymousId;
  } catch {
    return createAnonymousId();
  }
}

function readBrowserRoute() {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

export async function sendProductEvent(
  name: ProductEventName,
  context: ProductEventContext = {},
  options: ProductEventOptions = {},
) {
  const fetcher = options.fetcher ?? fetch;

  return fetcher(`${resolveApiBaseUrl(options.baseUrl)}/v1/analytics/events`, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      context,
      anonymousId: options.anonymousId,
      route: options.route,
      occurredAt: new Date().toISOString(),
    }),
  });
}

export function trackProductEvent(
  name: ProductEventName,
  context: ProductEventContext = {},
  options: ProductEventOptions = {},
) {
  if (typeof window === "undefined") return;

  void sendProductEvent(name, context, {
    ...options,
    anonymousId: options.anonymousId ?? readBrowserAnonymousId(),
    route: options.route ?? readBrowserRoute(),
  }).catch(() => {});
}
