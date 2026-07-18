import { getLlmClient } from "./llm/index.js";

const MAX_TOKENS_TITULO = 20;
const SEM_CONTEXTO = "SEM_CONTEXTO";

/** Formata o historico como transcript simples pro prompt de titulo. */
export function formatarTranscript(turnos: { role: "user" | "assistant"; conteudo: string }[]): string {
  return turnos.map((t) => `${t.role === "user" ? "Usuario" : "Assistente"}: ${t.conteudo}`).join("\n");
}

/**
 * Gera um titulo curto pro chat a partir do transcript disponivel ate agora
 * (primeiro turno ou mais), igual ChatGPT/Claude fazem na sidebar - one-shot,
 * sem tools, sem loop de agente (mesmo espirito de insightGenerator.ts).
 * Retorna "" quando o modelo ainda nao tem contexto suficiente (ex.: so uma
 * saudacao) - nesse caso agent.ts usa um titulo placeholder e tenta de novo
 * nos proximos turnos.
 */
export async function gerarTituloConversa(transcript: string): Promise<string> {
  const llm = await getLlmClient();
  const resposta = await llm.createCompletion({
    maxTokens: MAX_TOKENS_TITULO,
    tools: [],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Resuma o assunto da conversa abaixo em um titulo curto (ate 5 palavras), em portugues do Brasil, " +
              "para aparecer numa lista de chats. Sem aspas, sem ponto final, sem emoji. Responda so com o titulo.\n" +
              `Se a conversa ainda nao tiver assunto especifico (ex.: so uma saudacao tipo "oi"/"olá"), responda ` +
              `exatamente "${SEM_CONTEXTO}".\n\n${transcript}`,
          },
        ],
      },
    ],
  });

  const texto = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join(" ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .slice(0, 80);

  return texto.includes(SEM_CONTEXTO) ? "" : texto;
}
