import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.integration-spec.ts"],
    environment: "node",
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
