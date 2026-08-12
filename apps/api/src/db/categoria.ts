import { pool } from "./pool.js";

export type TipoTransacao = "despesa" | "receita";

/**
 * Lista os nomes de categoria conhecidos do usuario (globais + proprios),
 * compativeis com o tipo informado. Usado tanto para validar tools quanto
 * para injetar no system prompt (core memory, FOUNDATION.md secao 4.2).
 */
export async function listarCategorias(usuarioId: string, tipo?: TipoTransacao): Promise<string[]> {
  const { rows } = await pool.query<{ nome: string }>(
    `select distinct nome
       from categoria
      where (usuario_id is null or usuario_id = $1)
        and ($2::text is null or tipo = $2 or tipo = 'ambos')
      order by nome`,
    [usuarioId, tipo ?? null],
  );
  return rows.map((r) => r.nome);
}

/**
 * Validacao em tempo de execucao (TOOLS_FASE_0_1.md, secao 1, principio 2):
 * o schema da tool aceita categoria como string livre, o backend confere
 * contra as categorias conhecidas do usuario.
 */
export async function categoriaValida(usuarioId: string, categoria: string, tipo: TipoTransacao): Promise<boolean> {
  const { rowCount } = await pool.query(
    `select 1
       from categoria
      where (usuario_id is null or usuario_id = $1)
        and lower(nome) = lower($2)
        and (tipo = $3 or tipo = 'ambos')
      limit 1`,
    [usuarioId, categoria, tipo],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Conta manual padrao criada no primeiro contato do usuario (ver
 * db/usuario.ts) - usada quando conta_id nao e informado. So funciona
 * enquanto o usuario tiver exatamente uma conta: assim que ele cadastra uma
 * segunda (ver db/conta.ts::criarConta), o sistema deixa de assumir
 * silenciosamente qual foi usada e passa a exigir conta_id explicito em
 * toda tool/rota que registra algo numa conta.
 */
export async function contaPadrao(usuarioId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "select id from conta where usuario_id = $1 order by criado_em asc limit 2",
    [usuarioId],
  );
  if (rows.length === 0) {
    throw new Error(`usuario ${usuarioId} nao possui nenhuma conta`);
  }
  if (rows.length > 1) {
    throw new Error("usuário tem mais de uma conta cadastrada — informe conta_id explicitamente");
  }
  return rows[0]!.id;
}
