import type { ResultadoParseExtrato } from "./tipos.js";

/** Bancos costumam nomear o export da fatura com a data de fechamento/exportação (ex.: "Nubank_2026-01-04.csv") - so uma sugestao pra IA confirmar/usar, nunca aplicada silenciosamente sem aparecer no resumo. */
function extrairDataDoNomeArquivo(nomeArquivo: string): string | undefined {
  return /(\d{4}-\d{2}-\d{2})/.exec(nomeArquivo)?.[1];
}

/**
 * Bloco de texto acionavel (nao um aviso passivo) - o LLM deve agir sobre
 * isso chamando importar_extrato_bancario, nao so mencionar que recebeu um
 * anexo. Cada linha ganha um indice 1-based, na mesma ordem usada por
 * importarExtratoBancario (db/extratoImportacao.ts) pra casar a categoria
 * informada pela IA com a linha certa - a IA nunca repassa data/valor/
 * descricao de volta (isso vem sempre do parser, nunca do texto que ela
 * gerar), so o indice + categoria de quantas linhas quiser classificar. Como
 * o payload por linha ficou minusculo, uma unica chamada da tool cobre o
 * extrato inteiro, mesmo com centenas de lancamentos.
 */
export function montarResumoExtratoParaLlm(resultado: ResultadoParseExtrato, nomeArquivo: string): string {
  const { linhas, ignoradas, avisos, origemProvavel } = resultado;

  const partes: string[] = [];
  partes.push(`[extrato bancário analisado: ${nomeArquivo}, ${linhas.length} lançamento(s)${origemProvavel ? ` — provável extrato de ${origemProvavel === "conta" ? "conta corrente/poupança" : "fatura de cartão de crédito"}` : ""}]`);

  if (origemProvavel === "fatura") {
    const dataSugerida = extrairDataDoNomeArquivo(nomeArquivo);
    partes.push(
      dataSugerida
        ? `Data de fechamento sugerida pelo nome do arquivo: ${dataSugerida} (confirme com o usuário se não tiver certeza de que é essa; use como data_fechamento_fatura se parecer correta).`
        : "Não consegui sugerir a data de fechamento desta fatura a partir do nome do arquivo — pergunte ao usuário antes de importar (data_fechamento_fatura é obrigatória para fatura de cartão).",
    );
  }

  if (linhas.length > 0) {
    partes.push("# | data       | tipo    | valor    | descrição" + (linhas.some((l) => l.identificadorExterno) ? " | identificador_externo" : ""));
    linhas.forEach((l, i) => {
      // descricao ja inclui "- Parcela N/M" quando aplicavel (extraido dela mesma) - nao duplicar aqui.
      const categoriaTag = l.categoriaSugerida ? ` [categoria sugerida: ${l.categoriaSugerida}]` : "";
      const idTag = l.identificadorExterno ? ` | ${l.identificadorExterno}` : "";
      partes.push(`${i + 1} | ${l.data} | ${l.tipo.padEnd(7)} | ${l.valor.toFixed(2).padStart(8)} | ${l.descricao}${categoriaTag}${idTag}`);
    });
  }

  if (ignoradas.length > 0) {
    partes.push(`\n${ignoradas.length} lançamento(s) ignorado(s) (não representam gasto/receita novo — não têm índice, não entram na tool):`);
    for (const i of ignoradas) {
      partes.push(`${i.data} | ${i.valor.toFixed(2)} | ${i.descricao} — ${i.motivo}`);
    }
  }

  if (avisos.length > 0) {
    partes.push(`\nAvisos do parser: ${avisos.join("; ")}`);
  }

  partes.push(
    `\nChame a tool importar_extrato_bancario UMA VEZ para registrar TODOS os lançamentos numerados acima de uma vez - isso já acontece automaticamente ao chamar a tool, mesmo sem informar nada em 'categorias'. Seu único trabalho é, opcionalmente, informar em 'categorias' o índice + categoria (despesa) ou fonte (receita) de quantos lançamentos você conseguir classificar com confiança a partir das categorias conhecidas do usuário (mantendo a mesma categoria entre parcelas de uma mesma compra) — índices que você deixar de fora ainda são registrados normalmente, só ficam com categoria 'outros'. Nunca tente adivinhar ou repassar data/valor/descrição de volta, eles já vêm certos do arquivo. Informe conta_id para extrato de conta corrente/poupança ou cartao_id para fatura de cartão de crédito; se não estiver claro, pergunte ao usuário antes de chamar a tool.${
      origemProvavel === "fatura"
        ? " Para fatura de cartão, informe TAMBÉM data_fechamento_fatura (ver sugestão acima, ou pergunte ao usuário) — nunca deduza pelo ciclo mensal atual do cartão, já que o dia de fechamento pode ter mudado desde então."
        : ""
    }`,
  );

  return partes.join("\n");
}
