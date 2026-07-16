import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatMessage, CompletionResult, ContentPart, LlmClient } from "./types.js";
import { toOpenAiTools } from "./toolSchema.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/**
 * Traduz o formato neutro (tool_use/tool_result, system prompt separado) pro
 * formato OpenAI-compatible do DeepSeek (tool_calls/role:"tool", system como
 * mensagem no array).
 */
export function createDeepseekClient(apiKey: string, model: string): LlmClient {
  const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });

  return {
    async createCompletion({ systemPrompt, messages, tools, maxTokens }) {
      const oaMessages: ChatCompletionMessageParam[] = [];
      if (systemPrompt) oaMessages.push({ role: "system", content: systemPrompt });

      for (const m of messages as ChatMessage[]) {
        const toolUses = m.content.filter((p): p is Extract<ContentPart, { type: "tool_use" }> => p.type === "tool_use");
        const toolResults = m.content.filter(
          (p): p is Extract<ContentPart, { type: "tool_result" }> => p.type === "tool_result",
        );

        // DeepSeek nao aceita imagem/documento binario - vira uma linha de
        // texto-placeholder junto do resto do texto, pra nao perder o anexo
        // silenciosamente nem quebrar a chamada.
        const textos = m.content
          .filter(
            (p): p is Extract<ContentPart, { type: "text" | "image" | "document" }> =>
              p.type === "text" || p.type === "image" || p.type === "document",
          )
          .map((p) => {
            if (p.type === "text") return p.text;
            if (p.type === "image") return "[usuário enviou uma imagem]";
            return `[usuário enviou um documento${p.nome ? `: ${p.nome}` : ""}]`;
          });

        if (m.role === "assistant") {
          oaMessages.push({
            role: "assistant",
            content: textos.join("\n") || null,
            tool_calls: toolUses.length
              ? toolUses.map((tu) => ({
                  id: tu.id,
                  type: "function",
                  function: { name: tu.name, arguments: JSON.stringify(tu.input) },
                }))
              : undefined,
          });
        } else {
          if (textos.length) {
            oaMessages.push({ role: "user", content: textos.join("\n") });
          }
          for (const tr of toolResults) {
            oaMessages.push({ role: "tool", tool_call_id: tr.toolUseId, content: tr.content });
          }
        }
      }

      const resposta = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: oaMessages,
        tools: tools.length ? toOpenAiTools(tools) : undefined,
      });

      const choice = resposta.choices[0];
      if (!choice) throw new Error("resposta do DeepSeek sem choices");

      const content: ContentPart[] = [];
      if (choice.message.content) content.push({ type: "text", text: choice.message.content });
      for (const tc of choice.message.tool_calls ?? []) {
        if (tc.type !== "function") continue;
        content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
      }

      const stopReason: CompletionResult["stopReason"] =
        choice.finish_reason === "tool_calls" ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : "end_turn";

      return { content, stopReason };
    },
  } satisfies LlmClient;
}
