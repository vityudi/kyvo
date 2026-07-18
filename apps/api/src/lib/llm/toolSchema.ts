import type { ToolDefinition } from "./types.js";

/** Traduz o schema neutro (formato nativo Anthropic, input_schema) para o shape de tools da OpenAI/DeepSeek (function.parameters). */
export function toOpenAiTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}
