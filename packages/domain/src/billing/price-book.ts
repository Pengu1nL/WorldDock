export type ModelPrice = {
  provider: "openai" | "anthropic" | "openai-compatible";
  model: string;
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
};

export const MODEL_PRICE_BOOK: ModelPrice[] = [
  { provider: "openai", model: "gpt-5.4", inputCentsPerMillionTokens: 100, outputCentsPerMillionTokens: 500 },
  { provider: "anthropic", model: "claude-sonnet-5", inputCentsPerMillionTokens: 120, outputCentsPerMillionTokens: 600 },
  { provider: "openai-compatible", model: "qwen3-32b", inputCentsPerMillionTokens: 20, outputCentsPerMillionTokens: 80 },
];

export function calculateModelRunCostCents(input: {
  provider: ModelPrice["provider"];
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const price = MODEL_PRICE_BOOK.find((item) => item.provider === input.provider && item.model === input.model);
  if (!price) throw new Error(`Missing model price: ${input.provider}/${input.model}`);
  const inputCost = input.inputTokens * price.inputCentsPerMillionTokens / 1_000_000;
  const outputCost = input.outputTokens * price.outputCentsPerMillionTokens / 1_000_000;
  return Math.max(1, Math.ceil(inputCost + outputCost));
}
