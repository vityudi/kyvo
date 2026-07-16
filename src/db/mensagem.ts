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

export interface ConversaResumo {
  usuarioId: string;
  telegramChatId: number;
  ultimaMensagem: string;
  ultimaRole: "user" | "assistant";
  ultimaEm: string;
  totalMensagens: number;
}

/** Uma linha por usuario (ultima mensagem), para a lista de conversas do admin. */
export async function listarConversas(): Promise<ConversaResumo[]> {
  const { rows } = await pool.query<ConversaResumo>(
    `select usuario_id as "usuarioId",
            telegram_chat_id as "telegramChatId",
            ultima_mensagem as "ultimaMensagem",
            ultima_role as "ultimaRole",
            ultima_em as "ultimaEm",
            total_mensagens::int as "totalMensagens"
       from (
         select distinct on (m.usuario_id)
                m.usuario_id,
                u.telegram_chat_id,
                m.conteudo as ultima_mensagem,
                m.role as ultima_role,
                m.criado_em as ultima_em,
                count(*) over (partition by m.usuario_id) as total_mensagens
           from mensagem m
           join usuario u on u.id = m.usuario_id
          order by m.usuario_id, m.criado_em desc
       ) por_usuario
      order by ultima_em desc`,
  );
  return rows;
}

export interface MensagemAdmin {
  id: string;
  role: "user" | "assistant";
  conteudo: string;
  criadoEm: string;
}

/**
 * Pagina o historico completo de um usuario (mais antigas primeiro), para o
 * visualizador de conversas do admin - diferente de carregarHistorico, que
 * so serve o contexto curto usado pelo agente.
 */
export async function carregarMensagensPaginado(
  usuarioId: string,
  antesDe?: string,
  limite = 50,
): Promise<MensagemAdmin[]> {
  const { rows } = await pool.query<MensagemAdmin>(
    `select id, role, conteudo, criado_em as "criadoEm"
       from mensagem
      where usuario_id = $1
        and ($2::timestamptz is null or criado_em < $2)
      order by criado_em desc
      limit $3`,
    [usuarioId, antesDe ?? null, limite],
  );
  return rows.reverse();
}
