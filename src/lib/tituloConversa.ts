import { getLlmClient } from "./llm/index.js";

const MAX_TOKENS_TITULO = 20;

/**
 * Gera um titulo curto pro chat a partir do primeiro turno (user + assistant),
 * igual ChatGPT/Claude fazem na sidebar - one-shot, sem tools, sem loop de
 * agente (mesmo espirito de insightGenerator.ts).
 */
export async function gerarTituloConversa(mensagemUsuario: string, respostaAssistente: string): Promise<string> {
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
              "para aparecer numa lista de chats. Sem aspas, sem ponto final, sem emoji. Responda so com o titulo.\n\n" +
              `Usuario: ${mensagemUsuario}\nAssistente: ${respostaAssistente}`,
          },
        ],
      },
    ],
  });

  return resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join(" ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .slice(0, 80);
}
