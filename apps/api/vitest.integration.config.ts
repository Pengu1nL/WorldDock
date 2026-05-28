import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.integration-spec.ts"],
    environment: "node",
    env: {
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-5.4",
      OPENAI_API_KEY: "test-api-key",
    },
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
