import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, CompletionResult, ContentPart, LlmClient } from "./types.js";

/**
 * Adapter fino - o formato neutro (types.ts) ja e modelado bem proximo do
 * shape nativo da Anthropic, entao a traducao aqui e quase passthrough.
 */
export function createAnthropicClient(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });

  return {
    async createCompletion({ systemPrompt, messages, tools, maxTokens }) {
      const anthropicMessages: Anthropic.MessageParam[] = messages.map((m: ChatMessage) => ({
        role: m.role,
        content: m.content.map((part): Anthropic.ContentBlockParam => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "tool_use") return { type: "tool_use", id: part.id, name: part.name, input: part.input };
          return { type: "tool_result", tool_use_id: part.toolUseId, content: part.content, is_error: part.isError };
        }),
      }));

      const resposta = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: tools as unknown as Anthropic.Tool[],
        messages: anthropicMessages,
      });

      const content: ContentPart[] = resposta.content.map((block) => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.type === "tool_use") return { type: "tool_use", id: block.id, name: block.name, input: block.input };
        throw new Error(`bloco de conteudo inesperado do Anthropic: ${block.type}`);
      });

      const stopReason: CompletionResult["stopReason"] =
        resposta.stop_reason === "tool_use" ? "tool_use" : resposta.stop_reason === "max_tokens" ? "max_tokens" : "end_turn";

      return { content, stopReason };
    },
  } satisfies LlmClient;
}
