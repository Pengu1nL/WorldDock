import { describe, expect, it } from "vitest";
import { createAgentProviderFromEnv, OpenAiAgentProvider } from "./agent.provider";

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

describe("OpenAiAgentProvider", () => {
  it("yields usage as soon as the OpenAI stream reports it", async () => {
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode([
          'data: {"choices":[{"delta":{"content":"hi"}}]}',
          "",
          'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n")));
        controller.close();
      },
    }));
    const provider = new OpenAiAgentProvider({
      apiKey: "sk-test",
      model: "gpt-test",
      fetcher: async () => response,
    });

    const chunks = [];
    for await (const chunk of provider.stream({
      prompt: "hello",
      world: { id: "world_1", name: "测试世界", summary: "测试摘要" },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk) => chunk.type)).toEqual(["context", "delta", "usage", "suggestion"]);
    expect(chunks[2]).toEqual({
      type: "usage",
      tokenUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
  });
});
