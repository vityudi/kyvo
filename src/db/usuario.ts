import { pool } from "./pool.js";

export interface Usuario {
  id: string;
  telegram_chat_id: number;
}

/**
 * Garante que existe um usuario para este chat do Telegram, criando (com uma
 * conta manual padrao) no primeiro contato. Idempotente.
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

    const criado = await client.query<Usuario>(
      "INSERT INTO usuario (telegram_chat_id) VALUES ($1) RETURNING id, telegram_chat_id",
      [telegramChatId],
    );
    const usuario = criado.rows[0];
    if (!usuario) {
      throw new Error("falha ao criar usuario - insert nao retornou linha");
    }

    await client.query(
      "INSERT INTO conta (usuario_id, nome, tipo) VALUES ($1, 'Conta manual', 'manual')",
      [usuario.id],
    );

    await client.query("COMMIT");
    return usuario;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
