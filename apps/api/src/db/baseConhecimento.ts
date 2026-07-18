import { pool } from "./pool.js";

export interface PrincipioEncontrado {
  id: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  relevancia: number;
}

/**
 * Full-text search nativo do Postgres na base de conhecimento curada (camada
 * 5, corpus global, sem usuario_id) - sem embedding, sem servico externo.
 */
export async function buscarPrincipios(query: string, limite = 5): Promise<PrincipioEncontrado[]> {
  const { rows } = await pool.query<PrincipioEncontrado>(
    `select id, titulo, conteudo, tags,
            ts_rank(busca, websearch_to_tsquery('portuguese', $1)) as relevancia
       from base_conhecimento
      where ativo = true
        and busca @@ websearch_to_tsquery('portuguese', $1)
      order by relevancia desc
      limit $2`,
    [query, limite],
  );

  return rows;
}

export async function tituloExiste(titulo: string): Promise<boolean> {
  const { rowCount } = await pool.query("select 1 from base_conhecimento where titulo = $1", [titulo]);
  return (rowCount ?? 0) > 0;
}

export async function inserirDocumento(titulo: string, conteudo: string, tags: string[]): Promise<void> {
  await pool.query(
    `insert into base_conhecimento (titulo, conteudo, tags)
     values ($1, $2, $3)`,
    [titulo, conteudo, tags],
  );
}
