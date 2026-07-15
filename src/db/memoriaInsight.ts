import { pool } from "./pool.js";

export type TipoInsight = "resumo_mensal" | "anomalia" | "padrao_recorrente" | "decisao_usuario" | "contexto_pessoal";
export type CategoriaContextoPessoal =
  | "familia_dependentes"
  | "trabalho_renda"
  | "objetivos_planos"
  | "valores_estilo_vida"
  | "eventos_vida"
  | "relacao_com_dinheiro";

interface RegistrarInsightInput {
  tipo: TipoInsight;
  conteudo: string;
  categoria?: CategoriaContextoPessoal;
  periodoReferencia?: string;
  metadata?: Record<string, unknown>;
  origem?: "worker" | "conversa";
}

export interface InsightEncontrado {
  id: string;
  tipo: string;
  conteudo: string;
  periodo_referencia: string | null;
  metadata: Record<string, unknown>;
  relevancia: number;
}

/**
 * Grava um insight (camada 4 de RAG_MEMORY_ARCHITECTURE.md). A checagem de
 * `categoria` obrigatoria para tipo='contexto_pessoal' ja existe como check
 * constraint no banco (guardrail da secao 3.7) - aqui so repassamos o valor.
 * A coluna `busca` (tsvector) e gerada automaticamente pelo Postgres a
 * partir de `conteudo`, sem nenhuma chamada externa.
 */
export async function registrarInsight(
  usuarioId: string,
  input: RegistrarInsightInput,
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into memoria_insight
       (usuario_id, tipo, categoria, periodo_referencia, conteudo, metadata, origem)
     values ($1, $2, $3, $4::date, $5, $6::jsonb, $7)
     returning id`,
    [
      usuarioId,
      input.tipo,
      input.categoria ?? null,
      input.periodoReferencia ?? null,
      input.conteudo,
      JSON.stringify(input.metadata ?? {}),
      input.origem ?? "conversa",
    ],
  );

  const criado = rows[0];
  if (!criado) {
    throw new Error("falha ao registrar insight - insert nao retornou linha");
  }
  return criado;
}

/**
 * Full-text search nativo do Postgres (websearch_to_tsquery + ts_rank) sobre
 * os insights do usuario - sem embedding, sem servico externo. `usuario_id`
 * sempre filtrado primeiro.
 */
export async function buscarInsights(
  usuarioId: string,
  query: string,
  opts: { tipo?: TipoInsight; periodoDesde?: string; limite?: number } = {},
): Promise<InsightEncontrado[]> {
  const { rows } = await pool.query<InsightEncontrado>(
    `select id, tipo, conteudo, periodo_referencia, metadata,
            ts_rank(busca, websearch_to_tsquery('portuguese', $2)) as relevancia
       from memoria_insight
      where usuario_id = $1
        and busca @@ websearch_to_tsquery('portuguese', $2)
        and ($3::text is null or tipo = $3)
        and ($4::date is null or periodo_referencia >= $4)
      order by relevancia desc
      limit $5`,
    [usuarioId, query, opts.tipo ?? null, opts.periodoDesde ?? null, opts.limite ?? 5],
  );

  return rows;
}

export async function excluirInsight(usuarioId: string, insightId: string): Promise<{ id: string; ok: true }> {
  const { rowCount } = await pool.query("delete from memoria_insight where id = $1 and usuario_id = $2", [
    insightId,
    usuarioId,
  ]);

  if (!rowCount) {
    throw new Error("insight nao encontrado ou nao pertence a este usuario");
  }

  return { id: insightId, ok: true };
}
