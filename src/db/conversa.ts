import { logger } from "../lib/logger.js";
import { pool } from "./pool.js";

export interface Conversa {
  id: string;
  usuarioId: string;
  titulo: string | null;
  status: "ativa" | "arquivada";
}

const LIMITE_INATIVIDADE_MS = 12 * 60 * 60 * 1000;

/**
 * Arquiva a conversa ativa do usuario (se existir) e cria uma nova - usado
 * tanto pelo comando /nova/reset no Telegram/admin quanto pela expiracao
 * automatica por inatividade em obterOuCriarConversaAtiva. So reseta o
 * historico curto de chat (mensagem.conversa_id); o core memory do usuario
 * (orcamentos/metas/perfil/memoria_insight) continua intacto, pois fica por
 * usuario_id.
 */
async function arquivarAtivaECriarNova(usuarioId: string): Promise<Conversa> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      "update conversa set status = 'arquivada', atualizado_em = now() where usuario_id = $1 and status = 'ativa'",
      [usuarioId],
    );

    const criada = await client.query<{
      id: string;
      usuario_id: string;
      titulo: string | null;
      status: "ativa" | "arquivada";
    }>("insert into conversa (usuario_id) values ($1) returning id, usuario_id, titulo, status", [usuarioId]);
    const nova = criada.rows[0];
    if (!nova) throw new Error("falha ao criar conversa - insert nao retornou linha");

    await client.query("commit");
    return { id: nova.id, usuarioId: nova.usuario_id, titulo: nova.titulo, status: nova.status };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retorna a conversa ativa do usuario, criando uma se ele ainda nao tiver
 * nenhuma (primeiro contato). Idempotente, mesmo espirito de
 * obterOuCriarUsuario em usuario.ts. Se a conversa ativa estiver parada ha
 * mais de LIMITE_INATIVIDADE_MS (atualizado_em e tocado a cada mensagem, ver
 * tocarConversa em mensagem.ts), arquiva ela e comeca uma nova sozinha - o
 * usuario nao precisa lembrar de mandar /nova pra "renovar a sessao" depois
 * de um tempo sem falar com o bot.
 */
export async function obterOuCriarConversaAtiva(usuarioId: string): Promise<Conversa> {
  const { rows } = await pool.query<{
    id: string;
    usuario_id: string;
    titulo: string | null;
    status: "ativa" | "arquivada";
    atualizado_em: string;
  }>("select id, usuario_id, titulo, status, atualizado_em from conversa where usuario_id = $1 and status = 'ativa' limit 1", [
    usuarioId,
  ]);

  const existente = rows[0];
  if (existente) {
    const inativaDemais = Date.now() - new Date(existente.atualizado_em).getTime() > LIMITE_INATIVIDADE_MS;
    if (!inativaDemais) {
      return { id: existente.id, usuarioId: existente.usuario_id, titulo: existente.titulo, status: existente.status };
    }

    logger.info({ usuarioId, conversaId: existente.id }, "conversa expirou por inatividade - iniciando uma nova");
    return arquivarAtivaECriarNova(usuarioId);
  }

  const criada = await pool.query<{ id: string; usuario_id: string; titulo: string | null; status: "ativa" | "arquivada" }>(
    "insert into conversa (usuario_id) values ($1) returning id, usuario_id, titulo, status",
    [usuarioId],
  );
  const nova = criada.rows[0];
  if (!nova) throw new Error("falha ao criar conversa - insert nao retornou linha");

  return { id: nova.id, usuarioId: nova.usuario_id, titulo: nova.titulo, status: nova.status };
}

/**
 * Arquiva a conversa ativa do usuario (se existir) e cria uma nova - o
 * "iniciar nova conversa" acionado pelo comando /nova no Telegram ou pelo
 * admin.
 */
export async function iniciarNovaConversa(usuarioId: string): Promise<Conversa> {
  return arquivarAtivaECriarNova(usuarioId);
}

/** Resolve usuario/telegram_chat_id a partir de uma conversa - usado pela rota admin de "enviar como usuario". */
export async function obterConversaComUsuario(
  conversaId: string,
): Promise<{ id: string; usuarioId: string; telegramChatId: number } | null> {
  const { rows } = await pool.query<{ id: string; usuario_id: string; telegram_chat_id: number }>(
    `select c.id, c.usuario_id, u.telegram_chat_id
       from conversa c
       join usuario u on u.id = c.usuario_id
      where c.id = $1`,
    [conversaId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, usuarioId: row.usuario_id, telegramChatId: row.telegram_chat_id };
}

export interface ConversaResumo {
  id: string;
  usuarioId: string;
  telegramChatId: number;
  titulo: string | null;
  status: "ativa" | "arquivada";
  ultimaMensagem: string | null;
  ultimaRole: "user" | "assistant" | null;
  ultimaEm: string;
  totalMensagens: number;
}

/**
 * Lista achatada de todas as conversas (de todos os usuarios), mais recente
 * primeiro - a app nao agrupa por usuario na UI (nao e um produto
 * multi-usuario no sentido de precisar escolher "de quem" antes de ver os
 * chats: cada conversa ja carrega consigo a identificacao do contato do
 * Telegram).
 */
export async function listarConversas(): Promise<ConversaResumo[]> {
  const { rows } = await pool.query<{
    id: string;
    usuario_id: string;
    telegram_chat_id: number;
    titulo: string | null;
    status: "ativa" | "arquivada";
    ultima_mensagem: string | null;
    ultima_role: "user" | "assistant" | null;
    ultima_em: string;
    total_mensagens: number;
  }>(
    `select c.id,
            c.usuario_id,
            u.telegram_chat_id,
            c.titulo,
            c.status,
            m.conteudo as ultima_mensagem,
            m.role as ultima_role,
            coalesce(m.criado_em, c.criado_em) as ultima_em,
            coalesce(cont.total, 0)::int as total_mensagens
       from conversa c
       join usuario u on u.id = c.usuario_id
       left join lateral (
         select conteudo, role, criado_em from mensagem where conversa_id = c.id order by criado_em desc limit 1
       ) m on true
       left join lateral (
         select count(*) as total from mensagem where conversa_id = c.id
       ) cont on true
      order by ultima_em desc`,
  );

  return rows.map((r) => ({
    id: r.id,
    usuarioId: r.usuario_id,
    telegramChatId: r.telegram_chat_id,
    titulo: r.titulo,
    status: r.status,
    ultimaMensagem: r.ultima_mensagem,
    ultimaRole: r.ultima_role,
    ultimaEm: r.ultima_em,
    totalMensagens: r.total_mensagens,
  }));
}
