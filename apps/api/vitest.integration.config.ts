import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.integration-spec.ts"],
    environment: "node",
    env: {
      AI_PROVIDER: "pi",
      PI_MODEL_PROVIDER: "openai",
      PI_MODEL_ID: "gpt-5.4",
      PI_PROVIDER_API_KEY: "test-api-key",
    },
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
