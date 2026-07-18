import { pool } from "./pool.js";

export interface RegraCategorizacao {
  padrao_texto: string;
  categoria: string;
}

export async function definirRegraCategorizacao(
  usuarioId: string,
  padraoTexto: string,
  categoria: string,
): Promise<RegraCategorizacao> {
  const { rows } = await pool.query<RegraCategorizacao>(
    `insert into regra_categorizacao (usuario_id, padrao_texto, categoria)
     values ($1, $2, $3)
     on conflict (usuario_id, padrao_texto)
     do update set categoria = excluded.categoria
     returning padrao_texto, categoria`,
    [usuarioId, padraoTexto, categoria],
  );

  const regra = rows[0];
  if (!regra) {
    throw new Error("falha ao salvar regra de categorizacao - upsert nao retornou linha");
  }
  return regra;
}

export async function listarRegras(usuarioId: string): Promise<RegraCategorizacao[]> {
  const { rows } = await pool.query<RegraCategorizacao>(
    "select padrao_texto, categoria from regra_categorizacao where usuario_id = $1 order by padrao_texto",
    [usuarioId],
  );
  return rows;
}
