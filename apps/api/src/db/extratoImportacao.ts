import { createHash } from "node:crypto";
import type { LinhaExtrato } from "../lib/extrato/tipos.js";
import { resolverDataHoraLocalSp } from "../lib/tempo.js";
import { categoriaValida } from "./categoria.js";
import { obterOuCriarFaturaPorFechamentoExplicito } from "./fatura.js";
import { pool } from "./pool.js";

const CATEGORIA_PADRAO = "outros";

export interface CategoriaPorIndice {
  /** Numero do lancamento, 1-based, na mesma ordem em que aparece no resumo montado por montarResumoExtratoParaLlm. */
  indice: number;
  /** Categoria (despesa) ou fonte (receita) atribuida pela IA. */
  categoria: string;
}

export interface ImportarExtratoInput {
  conta_id?: string;
  cartao_id?: string;
  /**
   * Data de fechamento da fatura (YYYY-MM-DD) - obrigatoria quando cartao_id
   * e informado. Todas as despesas do lote pertencem a UMA UNICA fatura
   * (um arquivo de fatura exportado pelo banco ja e, por construcao, uma
   * fatura so) - essa data nunca e calculada a partir do dia_fechamento
   * cadastrado no cartao (que pode ter mudado desde entao), so a partir do
   * que a IA informar (idealmente inferido do nome do arquivo, ou perguntado
   * ao usuario quando nao estiver claro).
   */
  data_fechamento_fatura?: string;
  /** Opcional e parcial de proposito - indices omitidos ainda sao importados, so caem em CATEGORIA_PADRAO. */
  categorias?: CategoriaPorIndice[];
}

export interface ResultadoImportacao {
  importadas: number;
  duplicadas: number;
  /** Indices cuja categoria informada pela IA nao era valida - a transacao AINDA foi importada, so com CATEGORIA_PADRAO em vez da sugerida. */
  categoriasInvalidas: { indice: number; categoriaInformada: string }[];
  transacao_ids: string[];
}

function normalizarDescricao(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hash de dedup calculado no backend (nunca pela IA): com identificador
 * externo (FITID do OFX, Identificador do CSV Nubank conta), usa ele -
 * senao cai no hash de conteudo (mesma compra parcelada em meses diferentes
 * tem data/descricao diferentes - "Parcela 1/3" vs "Parcela 2/3" - entao ja
 * fica naturalmente distinta sem logica extra).
 */
function calcularOrigemHash(escopoId: string, linha: LinhaExtrato): string {
  const chave = linha.identificadorExterno
    ? `${escopoId}|id|${linha.identificadorExterno}`
    : `${escopoId}|${linha.data}|${linha.valor.toFixed(2)}|${linha.tipo}|${normalizarDescricao(linha.descricao)}`;
  return createHash("sha256").update(chave).digest("hex");
}

/**
 * Registra em lote as transacoes de um extrato OFX/CSV ja parseado
 * deterministicamente neste turno (`linhasDisponiveis`, resolvido em
 * agent.ts a partir de TurnoUsuario.linhasExtratoAnexado - nunca digitado
 * pela IA). A IA só entra com conta_id/cartao_id e, opcionalmente, a
 * categoria de alguns indices - TODA linha listada e importada
 * incondicionalmente (mesmo se a IA nao mencionar seu indice em
 * `categorias`, ou mencionar uma categoria invalida), porque a IA nao deve
 * conseguir "esquecer" ou "julgar fora" um lancamento real so por causa do
 * nome (ex.: achar que "Pagamento de fatura" nao devia entrar) - so decide
 * classificacao, nunca inclusao/exclusao.
 */
export async function importarExtratoBancario(
  usuarioId: string,
  input: ImportarExtratoInput,
  linhasDisponiveis: LinhaExtrato[],
): Promise<ResultadoImportacao> {
  const { conta_id: contaId, cartao_id: cartaoId, data_fechamento_fatura: dataFechamentoFatura, categorias = [] } = input;

  if (Boolean(contaId) === Boolean(cartaoId)) {
    throw new Error("informe exatamente um de conta_id ou cartao_id");
  }
  if (linhasDisponiveis.length === 0) {
    throw new Error("nenhum extrato analisado nesta mensagem para importar");
  }
  if (cartaoId && !dataFechamentoFatura) {
    throw new Error(
      "informe data_fechamento_fatura (a data em que esta fatura fechou, geralmente visivel no nome do arquivo ou perguntada ao usuario) - nao presuma pelo ciclo atual do cartao",
    );
  }

  const categoriaPorIndice = new Map(categorias.map((c) => [c.indice, c.categoria]));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let contaIdResolvida: string;
    let faturaId: string | null = null;

    if (cartaoId) {
      const { rows } = await client.query<{ conta_id: string }>(
        `select conta_id from cartao where id = $1 and usuario_id = $2 and ativo = true`,
        [cartaoId, usuarioId],
      );
      const cartao = rows[0];
      if (!cartao) throw new Error("cartao nao encontrado, inativo, ou nao pertence a este usuario");
      contaIdResolvida = cartao.conta_id;
      // uma unica fatura pro lote inteiro - um arquivo de fatura exportado
      // pelo banco ja e, por construcao, os lancamentos de uma unica fatura.
      faturaId = await obterOuCriarFaturaPorFechamentoExplicito(usuarioId, cartaoId, dataFechamentoFatura as string, client);
    } else {
      const { rowCount } = await client.query(`select 1 from conta where id = $1 and usuario_id = $2`, [contaId, usuarioId]);
      if (!rowCount) throw new Error("conta nao encontrada ou nao pertence a este usuario");
      contaIdResolvida = contaId as string;
    }

    const escopoId = cartaoId ?? (contaId as string);
    const categoriasInvalidas: { indice: number; categoriaInformada: string }[] = [];
    const transacaoIds: string[] = [];
    let duplicadas = 0;

    for (let i = 0; i < linhasDisponiveis.length; i++) {
      const linha = linhasDisponiveis[i]!;
      const indice = i + 1;

      const categoriaInformada = categoriaPorIndice.get(indice);
      let categoria = categoriaInformada ?? CATEGORIA_PADRAO;
      if (categoriaInformada && linha.tipo === "despesa" && !(await categoriaValida(usuarioId, categoriaInformada, "despesa"))) {
        categoriasInvalidas.push({ indice, categoriaInformada });
        categoria = CATEGORIA_PADRAO;
      }

      const origemHash = calcularOrigemHash(escopoId, linha);
      const dataHora = resolverDataHoraLocalSp(`${linha.data}T12:00:00`);
      const faturaIdLinha = linha.tipo === "despesa" ? faturaId : null;

      const { rows } = await client.query<{ id: string }>(
        `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, fonte, descricao, data_hora, fatura_id, origem_hash, parcela_atual, parcela_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12)
         on conflict (usuario_id, origem_hash) where origem_hash is not null do nothing
         returning id`,
        [
          usuarioId,
          contaIdResolvida,
          linha.tipo,
          linha.valor,
          categoria,
          linha.tipo === "receita" ? categoria : null,
          linha.descricao,
          dataHora,
          faturaIdLinha,
          origemHash,
          linha.parcelaAtual ?? null,
          linha.parcelaTotal ?? null,
        ],
      );

      const id = rows[0]?.id;
      if (id) transacaoIds.push(id);
      else duplicadas++;
    }

    await client.query("COMMIT");
    return { importadas: transacaoIds.length, duplicadas, categoriasInvalidas, transacao_ids: transacaoIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
