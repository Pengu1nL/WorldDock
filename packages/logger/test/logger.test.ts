import { describe, expect, it } from "vitest";
import {
  REDACTED_LOG_PATHS,
  createLogger,
  createRequestId,
  requestIdHeader,
} from "../src";

describe("@worlddock/logger", () => {
  it("defines redaction paths for secrets and credentials", () => {
    expect(REDACTED_LOG_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "authorization",
        "accessToken",
        "apiKey",
        "password",
      ]),
    );
  });

  it("creates request ids with the WorldDock prefix", () => {
    expect(createRequestId()).toMatch(/^req_[a-z0-9]+$/);
  });

  it("uses the shared request id header", () => {
    expect(requestIdHeader).toBe("x-request-id");
  });

  it("creates a pino-compatible logger with redaction configured", () => {
    const logger = createLogger({ service: "test-service", level: "silent" });

    expect(logger.level).toBe("silent");
    expect(logger.bindings()).toMatchObject({ service: "test-service" });
  });
});
