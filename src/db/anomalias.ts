import { pool } from "./pool.js";

const VARIACAO_MINIMA_PERCENTUAL = 40;
const VALOR_MINIMO_MES = 50;

export interface AnomaliaCandidata {
  categoria: string;
  valor_mes: number;
  media_anterior: number;
  variacao_percentual: number;
}

/**
 * Compara, por categoria, o total de despesas do mes corrente com a media
 * dos 3 meses anteriores (janela fixa - um mes sem gasto na categoria conta
 * como zero na media, nao e ignorado). So retorna candidatas com media
 * anterior > 0 (categoria sem historico e gasto novo, nao anomalia),
 * variacao >= 40% e valor do mes >= R$50 (evita ruido de categoria trivial).
 * Deteccao puramente estatistica (SQL) - a explicacao em texto e gerada
 * depois, so para as candidatas, via src/lib/insightGenerator.ts.
 */
export async function detectarAnomalias(usuarioId: string): Promise<AnomaliaCandidata[]> {
  const { rows } = await pool.query<{ categoria: string; valor_mes: string; media_anterior: string }>(
    `with mes_atual as (
       select categoria, sum(valor) as valor_mes
         from transacao
        where usuario_id = $1
          and tipo = 'despesa'
          and date_trunc('month', data) = date_trunc('month', current_date)
        group by categoria
     ),
     anteriores as (
       select categoria, sum(valor) / 3.0 as media_anterior
         from transacao
        where usuario_id = $1
          and tipo = 'despesa'
          and data >= date_trunc('month', current_date) - interval '3 months'
          and data < date_trunc('month', current_date)
        group by categoria
     )
     select m.categoria, m.valor_mes, coalesce(a.media_anterior, 0) as media_anterior
       from mes_atual m
       left join anteriores a on a.categoria = m.categoria
      where coalesce(a.media_anterior, 0) > 0
        and m.valor_mes >= $2
        and (m.valor_mes - a.media_anterior) / a.media_anterior >= $3`,
    [usuarioId, VALOR_MINIMO_MES, VARIACAO_MINIMA_PERCENTUAL / 100],
  );

  return rows.map((r) => {
    const valorMes = Number(r.valor_mes);
    const mediaAnterior = Number(r.media_anterior);
    return {
      categoria: r.categoria,
      valor_mes: valorMes,
      media_anterior: mediaAnterior,
      variacao_percentual: ((valorMes - mediaAnterior) / mediaAnterior) * 100,
    };
  });
}
