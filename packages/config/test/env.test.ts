import { describe, expect, it } from "vitest";
import { parseWorldDockEnv, runtimeEnvironmentSchema } from "../src";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    APP_ENV: "development",
    API_PORT: "4000",
    WEB_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://worlddock:worlddock@localhost:5432/worlddock",
    ...overrides,
  };
}

describe("@worlddock/config env", () => {
  it("accepts supported runtime environments", () => {
    expect(runtimeEnvironmentSchema.parse("development")).toBe("development");
    expect(runtimeEnvironmentSchema.parse("staging")).toBe("staging");
    expect(runtimeEnvironmentSchema.parse("production")).toBe("production");
  });

  it("parses the minimal backend environment used by the API", () => {
    const parsed = parseWorldDockEnv(baseEnv());

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.WORLD_DOCK_DATA_DIR).toBe(".worlddock/data");
    expect(parsed.AI_PROVIDER).toBe("openai");
  });

  it("accepts a custom local data directory", () => {
    const parsed = parseWorldDockEnv(baseEnv({ WORLD_DOCK_DATA_DIR: "/var/lib/worlddock" }));

    expect(parsed.WORLD_DOCK_DATA_DIR).toBe("/var/lib/worlddock");
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
        SENTRY_DSN: "",
        AI_MODEL: "",
        OPENAI_API_KEY: "",
      }),
    );

    expect(parsed.APP_ENV).toBe("staging");
    expect(parsed.SENTRY_DSN).toBeUndefined();
    expect(parsed.AI_MODEL).toBeUndefined();
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
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
