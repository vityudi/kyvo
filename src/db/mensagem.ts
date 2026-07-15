import { pool } from "./pool.js";

export interface Turno {
  role: "user" | "assistant";
  conteudo: string;
}

/**
 * Ultimas N mensagens do usuario, em ordem cronologica - contexto curto de
 * conversa (FOUNDATION.md, secao 4.3). So texto final de cada turno, nunca
 * os blocos internos de tool_use/tool_result do loop do agente.
 */
export async function carregarHistorico(usuarioId: string, limite = 20): Promise<Turno[]> {
  const { rows } = await pool.query<Turno>(
    `select role, conteudo
       from mensagem
      where usuario_id = $1
      order by criado_em desc
      limit $2`,
    [usuarioId, limite],
  );
  return rows.reverse();
}

export async function salvarTurno(usuarioId: string, textoUsuario: string, textoAssistente: string): Promise<void> {
  await pool.query(
    `insert into mensagem (usuario_id, role, conteudo)
     values ($1, 'user', $2), ($1, 'assistant', $3)`,
    [usuarioId, textoUsuario, textoAssistente],
  );
}
