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
    BETTER_AUTH_SECRET: "test_secret_at_least_32_characters",
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
    const parsed = parseWorldDockEnv(baseEnv());

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.WORLD_DOCK_EDITION).toBe("cloud");
    expect(parsed.AI_PROVIDER).toBe("openai");
  });

  it("requires a 32 character Better Auth secret", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ BETTER_AUTH_SECRET: "short_secret_16" })),
    ).toThrow();
  });

  it("requires a Better Auth base URL", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ BETTER_AUTH_URL: undefined })),
    ).toThrow();
  });

  it("rejects the disabled mock agent provider", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ AI_PROVIDER: "mock" })),
    ).toThrow(/AI_PROVIDER=mock/);
  });

  it("normalizes blank optional provider secrets so copied env files can parse", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        AI_MODEL: "",
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "",
        PI_MODEL_PROVIDER: "",
        PI_MODEL_ID: "",
        PI_PROVIDER_API_KEY: "",
      }),
    );

    expect(parsed.AI_MODEL).toBeUndefined();
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.OPENAI_BASE_URL).toBeUndefined();
    expect(parsed.PI_MODEL_PROVIDER).toBeUndefined();
    expect(parsed.PI_MODEL_ID).toBeUndefined();
    expect(parsed.PI_PROVIDER_API_KEY).toBeUndefined();
  });

  it("normalizes blank optional observability URLs in non-production environments", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        SENTRY_DSN: "",
        OTEL_EXPORTER_OTLP_ENDPOINT: "",
      }),
    );

    expect(parsed.SENTRY_DSN).toBeUndefined();
    expect(parsed.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it("rejects malformed dependency URLs", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ WEB_APP_URL: "not-a-url" })),
    ).toThrow();
  });

  it("rejects production without Sentry", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AI_MODEL: "gpt-5-mini",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/SENTRY_DSN/);
  });

  it("rejects NODE_ENV production without Sentry when APP_ENV is unset", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: undefined,
          AI_MODEL: "gpt-5-mini",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/SENTRY_DSN/);
  });

  it("does not apply production-only gates when APP_ENV is explicitly staging", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        NODE_ENV: "production",
        APP_ENV: "staging",
        WORLD_DOCK_EDITION: "local",
        SENTRY_DSN: "",
        AI_MODEL: "",
        OPENAI_API_KEY: "",
      }),
    );

    expect(parsed.APP_ENV).toBe("staging");
    expect(parsed.WORLD_DOCK_EDITION).toBe("local");
    expect(parsed.SENTRY_DSN).toBeUndefined();
    expect(parsed.AI_MODEL).toBeUndefined();
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
  });

  it("rejects local edition in production", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          WORLD_DOCK_EDITION: "local",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          AI_MODEL: "gpt-5-mini",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow("Production deployment must use WORLD_DOCK_EDITION=cloud.");
  });

  it("rejects production without OpenAI model configuration", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/AI_MODEL/);
  });

  it("rejects production with whitespace-only OpenAI model configuration", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          AI_MODEL: "   ",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/AI_MODEL/);
  });

  it("rejects production without OpenAI API credentials", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          AI_MODEL: "gpt-5-mini",
        }),
      ),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects production with whitespace-only OpenAI API credentials", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          AI_MODEL: "gpt-5-mini",
          OPENAI_API_KEY: "   ",
        }),
      ),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("accepts production with OpenAI model configuration", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        AI_MODEL: "gpt-5-mini",
        OPENAI_API_KEY: "sk-test",
      }),
    );

    expect(parsed.APP_ENV).toBe("production");
    expect(parsed.BETTER_AUTH_URL).toBe("http://localhost:4000");
    expect(parsed.AI_PROVIDER).toBe("openai");
  });

  it("requires pi model settings in production", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AI_PROVIDER: "pi",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        }),
      ),
    ).toThrow("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required");
  });

  it("accepts a production pi environment", () => {
    expect(
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AI_PROVIDER: "pi",
          PI_MODEL_PROVIDER: "openai",
          PI_MODEL_ID: "gpt-5-mini",
          PI_PROVIDER_API_KEY: "test_key",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        }),
      ).AI_PROVIDER,
    ).toBe("pi");
  });
});
