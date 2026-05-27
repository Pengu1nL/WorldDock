import { describe, expect, it } from "vitest";
import { parseWorldDockEnv, runtimeEnvironmentSchema, worldDockEditionSchema } from "../src";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    APP_ENV: "development",
    API_PORT: "4000",
    WEB_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://worlddock:worlddock@localhost:5432/worlddock",
    REDIS_URL: "redis://localhost:6379",
    MEILISEARCH_HOST: "http://localhost:7700",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "worlddock-local",
    BETTER_AUTH_SECRET: "test_secret_at_least_32_chars_value",
    BETTER_AUTH_URL: "http://localhost:4000",
    ...overrides,
  };
}

describe("@worlddock/config env", () => {
  it("accepts supported runtime environments", () => {
    expect(runtimeEnvironmentSchema.parse("development")).toBe("development");
    expect(runtimeEnvironmentSchema.parse("staging")).toBe("staging");
    expect(runtimeEnvironmentSchema.parse("production")).toBe("production");
  });

  it("accepts supported WorldDock editions", () => {
    expect(worldDockEditionSchema.parse("cloud")).toBe("cloud");
    expect(worldDockEditionSchema.parse("local")).toBe("local");
  });

  it("parses the minimal backend environment shared by API and worker", () => {
    expect(
      parseWorldDockEnv(baseEnv()).API_PORT,
    ).toBe(4000);
    expect(parseWorldDockEnv(baseEnv()).WORLD_DOCK_EDITION).toBe("cloud");
  });

  it("rejects malformed dependency URLs", () => {
    expect(() => parseWorldDockEnv(baseEnv({ WEB_APP_URL: "not-a-url" }))).toThrow();
  });

  it("requires strong auth secrets", () => {
    expect(() => parseWorldDockEnv(baseEnv({ BETTER_AUTH_SECRET: "short_secret" }))).toThrow();
  });

  it("rejects mock AI in production", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        AI_PROVIDER: "mock",
        SENTRY_DSN: "https://public@example.com/1",
      })),
    ).toThrow("AI_PROVIDER=mock is not allowed in production.");
  });

  it("rejects local edition in production", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        WORLD_DOCK_EDITION: "local",
        AI_PROVIDER: "pi",
        PI_MODEL_PROVIDER: "openai",
        PI_MODEL_ID: "gpt-5-mini",
        PI_PROVIDER_API_KEY: "test_key",
        SENTRY_DSN: "https://public@example.com/1",
      })),
    ).toThrow("Production deployment must use WORLD_DOCK_EDITION=cloud.");
  });

  it("allows local edition outside production for the later local plan", () => {
    expect(
      parseWorldDockEnv(baseEnv({
        APP_ENV: "staging",
        WORLD_DOCK_EDITION: "local",
      })).WORLD_DOCK_EDITION,
    ).toBe("local");
  });

  it("requires pi model settings in production", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        AI_PROVIDER: "pi",
        SENTRY_DSN: "https://public@example.com/1",
      })),
    ).toThrow("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required");
  });

  it("requires Sentry in production", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        AI_PROVIDER: "pi",
        PI_MODEL_PROVIDER: "openai",
        PI_MODEL_ID: "gpt-5-mini",
        PI_PROVIDER_API_KEY: "test_key",
      })),
    ).toThrow("SENTRY_DSN is required in production.");
  });

  it("accepts a production pi environment", () => {
    expect(
      parseWorldDockEnv(baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        AI_PROVIDER: "pi",
        PI_MODEL_PROVIDER: "openai",
        PI_MODEL_ID: "gpt-5-mini",
        PI_PROVIDER_API_KEY: "test_key",
        SENTRY_DSN: "https://public@example.com/1",
      })).AI_PROVIDER,
    ).toBe("pi");
  });
});
