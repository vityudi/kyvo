import { pool } from "./pool.js";

export type TipoAlerta = "orcamento_estourado" | "meta_prazo_proximo";

export interface OrcamentoEstourado {
  categoria: string;
  valor_limite: number;
  gasto_mes: number;
}

export interface MetaComPrazoProximo {
  id: string;
  nome: string;
  valor_alvo: number;
  valor_atual: number;
  prazo: string;
}

/** Orcamentos do usuario cujo gasto do mes corrente ja atingiu o limite. */
export async function orcamentosEstourados(usuarioId: string): Promise<OrcamentoEstourado[]> {
  const { rows } = await pool.query<{ categoria: string; valor_limite: string; gasto_mes: string }>(
    `select o.categoria, o.valor_limite,
            coalesce(sum(t.valor) filter (
              where t.tipo = 'despesa' and date_trunc('month', t.data) = date_trunc('month', current_date)
            ), 0) as gasto_mes
       from orcamento o
       left join transacao t on t.usuario_id = o.usuario_id and lower(t.categoria) = lower(o.categoria)
      where o.usuario_id = $1
      group by o.id, o.categoria, o.valor_limite
     having coalesce(sum(t.valor) filter (
              where t.tipo = 'despesa' and date_trunc('month', t.data) = date_trunc('month', current_date)
            ), 0) >= o.valor_limite`,
    [usuarioId],
  );

  return rows.map((r) => ({
    categoria: r.categoria,
    valor_limite: Number(r.valor_limite),
    gasto_mes: Number(r.gasto_mes),
  }));
}

/** Metas ativas com prazo dentro da janela informada e ainda nao concluidas. */
export async function metasComPrazoProximo(usuarioId: string, dias = 7): Promise<MetaComPrazoProximo[]> {
  const { rows } = await pool.query<{ id: string; nome: string; valor_alvo: string; valor_atual: string; prazo: string }>(
    `select id, nome, valor_alvo, valor_atual, prazo
       from meta
      where usuario_id = $1
        and status = 'ativa'
        and prazo is not null
        and prazo between current_date and current_date + ($2::int * interval '1 day')
        and valor_atual < valor_alvo`,
    [usuarioId, dias],
  );

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    valor_alvo: Number(r.valor_alvo),
    valor_atual: Number(r.valor_atual),
    prazo: r.prazo,
  }));
}

/**
 * Tenta registrar um alerta para dedupe - se ja existir um alerta com a
 * mesma chave/periodo, o insert e ignorado (`on conflict do nothing`) e a
 * funcao retorna false, sinalizando ao chamador para NAO reenviar a
 * mensagem. So retorna true na primeira vez que a condicao e detectada.
 */
export async function tentarRegistrarAlerta(
  usuarioId: string,
  tipo: TipoAlerta,
  chave: string,
  periodoReferencia: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `insert into alerta_enviado (usuario_id, tipo, chave, periodo_referencia)
     values ($1, $2, $3, $4::date)
     on conflict (usuario_id, tipo, chave, periodo_referencia) do nothing`,
    [usuarioId, tipo, chave, periodoReferencia],
  );

  return (rowCount ?? 0) > 0;
}
