import { describe, expect, it } from "vitest";
import { calculateModelRunCostCents, MODEL_PRICE_BOOK } from "@worlddock/domain";
import { calculateAgentRunCostCents } from "../src/modules/billing/billing.service";

describe("billing price book", () => {
  it("prices model runs from provider/model/token usage", () => {
    expect(MODEL_PRICE_BOOK).toContainEqual(expect.objectContaining({
      provider: "openai",
      model: "gpt-5.4",
    }));

    expect(calculateModelRunCostCents({
      provider: "openai",
      model: "gpt-5.4",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })).toBe(600);
  });

  it("keeps tiny alpha runs billable at a one-cent minimum", () => {
    expect(calculateModelRunCostCents({
      provider: "openai-compatible",
      model: "qwen3-32b",
      inputTokens: 12,
      outputTokens: 30,
    })).toBe(1);
  });

  it("does not charge model runs without token usage", () => {
    expect(calculateModelRunCostCents({
      provider: "openai",
      model: "gpt-5.4",
      inputTokens: 0,
      outputTokens: 0,
    })).toBe(0);
  });

  it.each([
    { label: "negative", inputTokens: -1, outputTokens: 1 },
    { label: "decimal", inputTokens: 1.5, outputTokens: 1 },
    { label: "NaN", inputTokens: Number.NaN, outputTokens: 1 },
    { label: "Infinity", inputTokens: Number.POSITIVE_INFINITY, outputTokens: 1 },
  ])("rejects $label token usage", ({ inputTokens, outputTokens }) => {
    expect(() => calculateModelRunCostCents({
      provider: "openai",
      model: "gpt-5.4",
      inputTokens,
      outputTokens,
    })).toThrow("Invalid token usage: token counts must be non-negative integers");
  });

  it("rejects model runs without an explicit price", () => {
    expect(() => calculateModelRunCostCents({
      provider: "openai",
      model: "missing-model",
      inputTokens: 1,
      outputTokens: 1,
    })).toThrow("Missing model price: openai/missing-model");
  });

  it("prices agent runs from input and output tokens even when total tokens is zero", () => {
    expect(calculateAgentRunCostCents({
      inputTokens: 12,
      outputTokens: 30,
      totalTokens: 0,
    }, {
      provider: "openai-compatible",
      model: "qwen3-32b",
    })).toBe(1);
  });
});
