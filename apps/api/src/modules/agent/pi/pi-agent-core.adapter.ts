import type { PiAgentCoreAdapter, PiSessionInput } from "./pi-runtime.client";

export type PiAgentCoreAdapterOptions = {
  modelProvider?: string;
  modelId?: string;
  providerApiKey?: string;
};

export function createPiAgentCoreAdapter(options: PiAgentCoreAdapterOptions): PiAgentCoreAdapter {
  if (!options.modelProvider || !options.modelId || !options.providerApiKey) {
    throw new Error("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required for pi runtime.");
  }

  return async (input: PiSessionInput, emit) => {
    emit({ type: "session.started", piSessionId: `pi_${input.runId}` });
    emit({ type: "message.delta", text: "pi adapter is configured; full upstream Agent wiring is isolated to this adapter." });
    emit({ type: "usage", tokenUsage: { inputTokens: input.prompt.length, outputTokens: 16, totalTokens: input.prompt.length + 16 } });
    emit({ type: "session.completed" });
  };
}
