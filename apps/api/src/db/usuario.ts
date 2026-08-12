import type { PoolClient } from "pg";
import { pool } from "./pool.js";

export interface Usuario {
  id: string;
  /** Null ate a pessoa falar com o bot no Telegram pela primeira vez - ver obterOuCriarUsuarioWeb. */
  telegram_chat_id: number | null;
}

/** Usado pelo worker para iterar todos os usuarios (alertas/consolidacao de memoria). */
export async function listarTodosUsuarios(): Promise<Usuario[]> {
  const { rows } = await pool.query<Usuario>("select id, telegram_chat_id from usuario");
  return rows;
}

/** Usado pelo admin para resolver o telegram_chat_id a partir do id ao enviar mensagem pela web. */
export async function obterUsuarioPorId(id: string): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>("select id, telegram_chat_id from usuario where id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Resolve o unico usuario existente - o produto e single-tenant hoje (um
 * unico contato do Telegram por deploy), entao o painel web de
 * transacoes/dashboard nao precisa de seletor de usuario. Se/quando o app
 * virar multi-tenant, isso muda para resolver o usuario da sessao logada.
 */
export async function obterUsuarioUnico(): Promise<Usuario> {
  const usuarios = await listarTodosUsuarios();
  const usuario = usuarios[0];
  if (!usuario) {
    throw new Error("nenhum usuario cadastrado ainda");
  }
  return usuario;
}

async function inserirUsuarioComContaPadrao(client: PoolClient, telegramChatId: number | null): Promise<Usuario> {
  const criado = await client.query<Usuario>(
    "INSERT INTO usuario (telegram_chat_id) VALUES ($1) RETURNING id, telegram_chat_id",
    [telegramChatId],
  );
  const usuario = criado.rows[0];
  if (!usuario) {
    throw new Error("falha ao criar usuario - insert nao retornou linha");
  }

  await client.query("INSERT INTO conta (usuario_id, nome, tipo) VALUES ($1, 'Conta manual', 'manual')", [usuario.id]);

  return usuario;
}

/**
 * Garante que existe um usuario para este chat do Telegram, criando (com uma
 * conta manual padrao) no primeiro contato. Idempotente.
 *
 * Como o app e single-tenant e o painel web pode ja ter criado o (unico)
 * usuario antes de qualquer contato pelo Telegram (ver obterOuCriarUsuarioWeb,
 * telegram_chat_id null nesse caso), o primeiro contato real pelo Telegram
 * amarra o chat id a esse usuario em vez de criar um segundo - senao o
 * historico/orcamentos/metas criados pelo painel ficariam "perdidos" num
 * usuario que o Telegram nunca mais alcanca.
 */
export async function obterOuCriarUsuario(telegramChatId: number): Promise<Usuario> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existente = await client.query<Usuario>(
      "SELECT id, telegram_chat_id FROM usuario WHERE telegram_chat_id = $1",
      [telegramChatId],
    );
    if (existente.rows[0]) {
      await client.query("COMMIT");
      return existente.rows[0];
    }

    const semTelegramAinda = await client.query<Usuario>(
      "SELECT id, telegram_chat_id FROM usuario WHERE telegram_chat_id IS NULL LIMIT 1",
    );
    if (semTelegramAinda.rows[0]) {
      const vinculado = await client.query<Usuario>(
        "UPDATE usuario SET telegram_chat_id = $2 WHERE id = $1 RETURNING id, telegram_chat_id",
        [semTelegramAinda.rows[0].id, telegramChatId],
      );
      await client.query("COMMIT");
      return vinculado.rows[0]!;
    }

    const usuario = await inserirUsuarioComContaPadrao(client, telegramChatId);
    await client.query("COMMIT");
    return usuario;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve o (unico) usuario para o painel web usar, criando-o sem
 * telegram_chat_id se ainda nao existir nenhum - permite conversar pelo
 * painel antes de qualquer contato pelo Telegram, desde que haja um provedor
 * de IA configurado (a falta de Telegram so limita entrega proativa de
 * alertas/lembretes, nao a conversa em si). Idempotente, mesmo espirito de
 * obterOuCriarUsuario.
 */
export async function obterOuCriarUsuarioWeb(): Promise<Usuario> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existente = await client.query<Usuario>(
      "SELECT id, telegram_chat_id FROM usuario ORDER BY criado_em ASC LIMIT 1",
    );
    if (existente.rows[0]) {
      await client.query("COMMIT");
      return existente.rows[0];
    }

    const usuario = await inserirUsuarioComContaPadrao(client, null);
    await client.query("COMMIT");
    return usuario;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
