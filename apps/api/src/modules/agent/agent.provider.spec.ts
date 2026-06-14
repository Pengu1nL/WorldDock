import { describe, expect, it } from "vitest";
import { createAgentProviderFromEnv, PiAgentProvider } from "./agent.provider";

describe("createAgentProviderFromEnv", () => {
  it("creates the pi provider by default", () => {
    expect(createAgentProviderFromEnv({})).toBeInstanceOf(PiAgentProvider);
  });

  it("creates the pi provider when explicitly configured", () => {
    expect(createAgentProviderFromEnv({ AI_PROVIDER: "pi" })).toBeInstanceOf(PiAgentProvider);
  });

  it("rejects legacy provider names", () => {
    for (const provider of ["openai", "vercel-ai", "mock"]) {
      expect(() => createAgentProviderFromEnv({ AI_PROVIDER: provider })).toThrow(/AI_PROVIDER=pi/);
    }
  });
});
