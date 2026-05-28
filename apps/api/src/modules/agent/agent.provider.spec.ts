import { describe, expect, it } from "vitest";
import { createAgentProviderFromEnv } from "./agent.provider";

describe("createAgentProviderFromEnv", () => {
  it("rejects the disabled mock provider", () => {
    expect(() =>
      createAgentProviderFromEnv({
        AI_PROVIDER: "mock",
      }),
    ).toThrow(/mock/i);
  });

  it("requires an OpenAI API key for the real provider", () => {
    expect(() =>
      createAgentProviderFromEnv({
        AI_PROVIDER: "openai",
        AI_MODEL: "gpt-real",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("creates the OpenAI provider when real credentials are present", () => {
    const provider = createAgentProviderFromEnv({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      AI_MODEL: "gpt-real",
    });

    expect(provider.constructor.name).toBe("OpenAiAgentProvider");
  });
});
