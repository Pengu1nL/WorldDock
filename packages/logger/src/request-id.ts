import { randomUUID } from "node:crypto";

export const requestIdHeader = "x-request-id";

export function createRequestId(): string {
  return `req_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}
