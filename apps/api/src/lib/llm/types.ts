/**
 * Formato neutro de tools/mensagens usado pelo loop do agente (agent.ts) e
 * pelo insightGenerator.ts. Cada provider (Anthropic, DeepSeek) traduz de/para
 * o formato nativo do proprio SDK dentro do seu client - o resto do codigo
 * nunca importa tipos de `@anthropic-ai/sdk` ou `openai` diretamente.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    minProperties?: number;
  };
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  // base64. Suportado nativamente so pela Anthropic (visao) - o client do
  // DeepSeek traduz para um placeholder em texto, ja que o modelo nao aceita
  // imagem/documento binario.
  | { type: "image"; mimeType: string; data: string }
  // media_type deve ser "application/pdf" - e o unico formato de documento
  // que o bloco nativo da Anthropic aceita.
  | { type: "document"; mimeType: string; data: string; nome?: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: ContentPart[];
}

export type StopReason = "tool_use" | "end_turn" | "max_tokens";

export interface CompletionResult {
  content: ContentPart[];
  stopReason: StopReason;
}

export interface LlmClient {
  createCompletion(params: {
    systemPrompt?: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<CompletionResult>;
}
