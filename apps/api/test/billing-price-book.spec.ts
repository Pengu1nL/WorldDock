import { describe, expect, it } from "vitest";
import { calculateModelRunCostCents, MODEL_PRICE_BOOK } from "@worlddock/domain";

describe("billing price book", () => {
  it("prices model runs from provider/model/token usage", () => {
    expect(MODEL_PRICE_BOOK).toContainEqual(expect.objectContaining({ provider: "openai", model: "gpt-5.4" }));
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
});
