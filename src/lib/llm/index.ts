import { getActiveLlmConfig } from "../../db/llmConfig.js";
import { createAnthropicClient } from "./anthropicClient.js";
import { createDeepseekClient } from "./deepseekClient.js";
import type { LlmClient } from "./types.js";

export class LlmNaoConfiguradoError extends Error {
  constructor() {
    super("Nenhum provedor de LLM esta ativo. Configure em /admin.");
  }
}

/** Le a config ativa do banco (llm_provedor) e instancia o client certo. */
export async function getLlmClient(): Promise<LlmClient> {
  const config = await getActiveLlmConfig();
  if (!config) throw new LlmNaoConfiguradoError();

  return config.provider === "anthropic"
    ? createAnthropicClient(config.apiKey, config.modelo)
    : createDeepseekClient(config.apiKey, config.modelo);
}

export type { ChatMessage, CompletionResult, ContentPart, LlmClient, ToolDefinition } from "./types.js";
