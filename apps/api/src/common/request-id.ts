import { randomUUID } from "node:crypto";

export const requestIdHeader = "x-request-id";

export type RequestWithRequestId = {
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export function createRequestId(): string {
  return `req_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function getRequestId(request: RequestWithRequestId): string {
  return request.requestId ?? readIncomingRequestId(request) ?? createRequestId();
}

export function readIncomingRequestId(request: RequestWithRequestId): string | undefined {
  const value = request.headers?.[requestIdHeader];
  if (Array.isArray(value)) return value[0];
  return value;
}
