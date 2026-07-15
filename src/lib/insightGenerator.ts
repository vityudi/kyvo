import type { ResumoPeriodo } from "../db/transacao.js";
import { anthropic, DEFAULT_MODEL } from "./anthropic.js";

const MAX_TOKENS_INSIGHT = 300;

/**
 * Geracao de texto one-shot (sem tools, sem loop de agente) a partir de
 * numeros ja calculados deterministicamente em SQL (RAG_MEMORY_ARCHITECTURE.md,
 * secao 5) - o Claude so transforma numero em texto util, nunca inventa o
 * dado de base.
 */
async function gerarTexto(prompt: string): Promise<string> {
  const resposta = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS_INSIGHT,
    messages: [{ role: "user", content: prompt }],
  });

  return resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();
}

export async function gerarExplicacaoAnomalia(dados: {
  categoria: string;
  valorMes: number;
  mediaAnterior: number;
  variacaoPercentual: number;
}): Promise<string> {
  return gerarTexto(
    `Explique em uma frase curta e natural, em portugues do Brasil, por que o gasto na categoria ` +
      `"${dados.categoria}" deste mes esta fora do padrao. Dados: valor do mes = R$ ${dados.valorMes.toFixed(2)}, ` +
      `media dos 3 meses anteriores = R$ ${dados.mediaAnterior.toFixed(2)}, variacao = ` +
      `${dados.variacaoPercentual.toFixed(0)}%. Responda so com a frase, sem saudacao nem introducao.`,
  );
}

export async function gerarResumoMensal(resumo: ResumoPeriodo, mesReferencia: string): Promise<string> {
  const porCategoria = (resumo.por_categoria ?? [])
    .map((c) => `${c.categoria}: R$ ${c.total.toFixed(2)}`)
    .join(", ");

  return gerarTexto(
    `Escreva um resumo qualitativo curto (2-3 frases), em portugues do Brasil, sobre o mes financeiro ` +
      `de ${mesReferencia} de um usuario. Nao repita so os numeros - interprete o que eles significam. ` +
      `Dados: total de despesas = R$ ${resumo.total_despesas.toFixed(2)}, total de receitas = ` +
      `R$ ${resumo.total_receitas.toFixed(2)}, saldo do mes = R$ ${resumo.saldo.toFixed(2)}, gasto por ` +
      `categoria = [${porCategoria || "sem dados"}]${
        resumo.periodo_anterior
          ? `, comparado ao mes anterior: despesas de R$ ${resumo.periodo_anterior.total_despesas.toFixed(2)} ` +
            `(variacao de ${resumo.periodo_anterior.variacao_percentual?.toFixed(0) ?? "?"}%)`
          : ""
      }. Responda so com o resumo, sem saudacao nem introducao.`,
  );
}
