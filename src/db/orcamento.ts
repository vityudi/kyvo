import { pool } from "./pool.js";

export interface Orcamento {
  id: string;
  categoria: string;
  valor_limite: number;
  periodo: string;
}

/**
 * Cria ou substitui (upsert) o orcamento mensal de uma categoria - nunca cria
 * duplicado para a mesma categoria (unique (usuario_id, categoria) no schema).
 */
export async function criarOuAtualizarOrcamento(
  usuarioId: string,
  categoria: string,
  valorLimite: number,
): Promise<Orcamento> {
  const { rows } = await pool.query<{ id: string; categoria: string; valor_limite: string; periodo: string }>(
    `insert into orcamento (usuario_id, categoria, valor_limite)
     values ($1, $2, $3)
     on conflict (usuario_id, categoria)
     do update set valor_limite = excluded.valor_limite, atualizado_em = now()
     returning id, categoria, valor_limite, periodo`,
    [usuarioId, categoria, valorLimite],
  );

  const orcamento = rows[0];
  if (!orcamento) {
    throw new Error("falha ao criar orcamento - upsert nao retornou linha");
  }
  return { ...orcamento, valor_limite: Number(orcamento.valor_limite) };
}

export async function listarOrcamentos(usuarioId: string): Promise<Orcamento[]> {
  const { rows } = await pool.query<{ id: string; categoria: string; valor_limite: string; periodo: string }>(
    "select id, categoria, valor_limite, periodo from orcamento where usuario_id = $1 order by categoria",
    [usuarioId],
  );
  return rows.map((r) => ({ ...r, valor_limite: Number(r.valor_limite) }));
}
