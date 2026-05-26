import { describe, expect, it } from "vitest";
import { parseWorldDockEnv, runtimeEnvironmentSchema } from "../src";

describe("@worlddock/config env", () => {
  it("accepts supported runtime environments", () => {
    expect(runtimeEnvironmentSchema.parse("development")).toBe("development");
    expect(runtimeEnvironmentSchema.parse("staging")).toBe("staging");
    expect(runtimeEnvironmentSchema.parse("production")).toBe("production");
  });

  it("parses the minimal backend environment shared by API and worker", () => {
    expect(
      parseWorldDockEnv({
        NODE_ENV: "test",
        APP_ENV: "development",
        API_PORT: "4000",
        WEB_APP_URL: "http://localhost:3000",
        DATABASE_URL: "postgresql://worlddock:worlddock@localhost:5432/worlddock",
        REDIS_URL: "redis://localhost:6379",
        MEILISEARCH_HOST: "http://localhost:7700",
        S3_ENDPOINT: "http://localhost:9000",
        S3_BUCKET: "worlddock-local",
        BETTER_AUTH_SECRET: "test_secret_at_least_16_chars",
      }).API_PORT,
    ).toBe(4000);
  });

  it("rejects malformed dependency URLs", () => {
    expect(() =>
      parseWorldDockEnv({
        NODE_ENV: "test",
        APP_ENV: "development",
        API_PORT: "4000",
        WEB_APP_URL: "not-a-url",
        DATABASE_URL: "postgresql://worlddock:worlddock@localhost:5432/worlddock",
        REDIS_URL: "redis://localhost:6379",
        MEILISEARCH_HOST: "http://localhost:7700",
        S3_ENDPOINT: "http://localhost:9000",
        S3_BUCKET: "worlddock-local",
        BETTER_AUTH_SECRET: "test_secret_at_least_16_chars",
      }),
    ).toThrow();
  });
});
