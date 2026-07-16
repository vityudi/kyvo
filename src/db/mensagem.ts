import { listarAnexosPorMensagens, type Anexo } from "./anexo.js";
import { pool } from "./pool.js";

export interface Turno {
  role: "user" | "assistant";
  conteudo: string;
}

/**
 * Ultimas N mensagens da conversa, em ordem cronologica - contexto curto de
 * conversa (FOUNDATION.md, secao 4.3). So texto final de cada turno, nunca
 * os blocos internos de tool_use/tool_result do loop do agente. Escopado por
 * conversa_id: "iniciar nova conversa" arquiva a conversa anterior e passa a
 * usar um conversa_id novo, entao o historico curto naturalmente reseta.
 */
export async function carregarHistorico(conversaId: string, limite = 20): Promise<Turno[]> {
  const { rows } = await pool.query<Turno>(
    `select role, conteudo
       from mensagem
      where conversa_id = $1
      order by criado_em desc
      limit $2`,
    [conversaId, limite],
  );
  return rows.reverse();
}

/**
 * Salva o turno do usuario e retorna o id da mensagem - os anexos (imagem/
 * audio/documento) sao criados depois, referenciando esse id.
 */
export async function salvarMensagemUsuario(usuarioId: string, conversaId: string, texto: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into mensagem (usuario_id, conversa_id, role, conteudo)
     values ($1, $2, 'user', $3)
     returning id`,
    [usuarioId, conversaId, texto],
  );
  const row = rows[0];
  if (!row) throw new Error("falha ao salvar mensagem do usuario - insert nao retornou linha");

  await tocarConversa(conversaId);
  return row.id;
}

export async function salvarRespostaAssistente(usuarioId: string, conversaId: string, texto: string): Promise<void> {
  await pool.query(
    `insert into mensagem (usuario_id, conversa_id, role, conteudo)
     values ($1, $2, 'assistant', $3)`,
    [usuarioId, conversaId, texto],
  );
  await tocarConversa(conversaId);
}

async function tocarConversa(conversaId: string): Promise<void> {
  await pool.query("update conversa set atualizado_em = now() where id = $1", [conversaId]);
}

export interface MensagemAdmin {
  id: string;
  role: "user" | "assistant";
  conteudo: string;
  criadoEm: string;
  anexos: Anexo[];
}

/**
 * Pagina o historico completo de uma conversa (mais antigas primeiro), para
 * o visualizador de conversas do admin - diferente de carregarHistorico, que
 * so serve o contexto curto usado pelo agente.
 */
export async function carregarMensagensPaginado(
  conversaId: string,
  antesDe?: string,
  limite = 50,
): Promise<MensagemAdmin[]> {
  const { rows } = await pool.query<{ id: string; role: "user" | "assistant"; conteudo: string; criadoEm: string }>(
    `select id, role, conteudo, criado_em as "criadoEm"
       from mensagem
      where conversa_id = $1
        and ($2::timestamptz is null or criado_em < $2)
      order by criado_em desc
      limit $3`,
    [conversaId, antesDe ?? null, limite],
  );

  const ordenadas = rows.reverse();
  const anexosPorMensagem = await listarAnexosPorMensagens(ordenadas.map((m) => m.id));

  return ordenadas.map((m) => ({ ...m, anexos: anexosPorMensagem.get(m.id) ?? [] }));
}
