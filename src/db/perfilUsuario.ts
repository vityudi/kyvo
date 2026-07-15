import { pool } from "./pool.js";

export type AtributosPerfil = Record<string, string>;

/**
 * Perfil pessoal (RAG_MEMORY_ARCHITECTURE.md, secao 3.2b) - fatos estaveis
 * de vida (ocupacao, estabilidade de renda, grandes objetivos, etc.),
 * sempre lido por inteiro e injetado no system prompt, nunca buscado por
 * similaridade.
 */
export async function obterPerfil(usuarioId: string): Promise<AtributosPerfil> {
  const { rows } = await pool.query<{ atributos: AtributosPerfil }>(
    "select atributos from perfil_usuario where usuario_id = $1",
    [usuarioId],
  );
  return rows[0]?.atributos ?? {};
}

export async function atualizarAtributoPerfil(
  usuarioId: string,
  atributo: string,
  valor: string,
): Promise<AtributosPerfil> {
  const { rows } = await pool.query<{ atributos: AtributosPerfil }>(
    `insert into perfil_usuario (usuario_id, atributos)
     values ($1, jsonb_build_object($2::text, $3::text))
     on conflict (usuario_id)
     do update set atributos = perfil_usuario.atributos || jsonb_build_object($2::text, $3::text),
                   atualizado_em = now()
     returning atributos`,
    [usuarioId, atributo, valor],
  );

  const perfil = rows[0];
  if (!perfil) {
    throw new Error("falha ao atualizar perfil - upsert nao retornou linha");
  }
  return perfil.atributos;
}
