import { decrypt, encrypt } from "../lib/crypto.js";
import { pool } from "./pool.js";

export interface TelegramConfig {
  botToken: string;
  webhookSecret: string | null;
  ownerChatId: number | null;
}

export interface TelegramConfigResumo {
  botTokenConfigurado: boolean;
  webhookSecretConfigurado: boolean;
  ownerChatId: number | null;
  atualizadoEm: string;
}

/**
 * Config do bot em uso agora. Sem cache, mesmo raciocinio de getActiveLlmConfig
 * (lookup indexado unico, trafego baixo) - troca no painel /web vale ja na
 * proxima request/mensagem.
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const { rows } = await pool.query<{
    bot_token_cifrado: string | null;
    webhook_secret_cifrado: string | null;
    owner_chat_id: string | null;
  }>("select bot_token_cifrado, webhook_secret_cifrado, owner_chat_id from telegram_config where id");

  const row = rows[0];
  if (!row || !row.bot_token_cifrado) return null;

  return {
    botToken: decrypt(row.bot_token_cifrado),
    webhookSecret: row.webhook_secret_cifrado ? decrypt(row.webhook_secret_cifrado) : null,
    ownerChatId: row.owner_chat_id != null ? Number(row.owner_chat_id) : null,
  };
}

export async function obterResumoTelegramConfig(): Promise<TelegramConfigResumo> {
  const { rows } = await pool.query<{
    bot_token_cifrado: string | null;
    webhook_secret_cifrado: string | null;
    owner_chat_id: string | null;
    atualizado_em: string;
  }>(
    "select bot_token_cifrado, webhook_secret_cifrado, owner_chat_id, atualizado_em from telegram_config where id",
  );

  const row = rows[0];
  return {
    botTokenConfigurado: Boolean(row?.bot_token_cifrado),
    webhookSecretConfigurado: Boolean(row?.webhook_secret_cifrado),
    ownerChatId: row?.owner_chat_id != null ? Number(row.owner_chat_id) : null,
    atualizadoEm: row?.atualizado_em ?? new Date().toISOString(),
  };
}

/**
 * Atualiza bot token, webhook secret e/ou chat autorizado. Bot token e webhook
 * secret so sobrescrevem quando vem preenchidos (campos write-only, a UI
 * nunca devolve o valor real depois de salvo). ownerChatId e tri-state: omitido
 * (undefined) mantem o valor atual (ex.: o seed de bootstrap, que nao sabe
 * nada sobre esse campo), null limpa a restricao, um numero a define - o
 * formulario do painel admin sempre manda um dos dois ultimos.
 */
export async function upsertTelegramConfig(
  botTokenPlain: string | undefined,
  webhookSecretPlain: string | undefined,
  ownerChatId?: number | null,
): Promise<void> {
  const botTokenCifrado = botTokenPlain ? encrypt(botTokenPlain) : null;
  const webhookSecretCifrado = webhookSecretPlain ? encrypt(webhookSecretPlain) : null;
  const ownerChatIdInformado = ownerChatId !== undefined;

  await pool.query(
    `update telegram_config
     set bot_token_cifrado = coalesce($1, bot_token_cifrado),
         webhook_secret_cifrado = coalesce($2, webhook_secret_cifrado),
         owner_chat_id = case when $3 then $4::bigint else owner_chat_id end,
         atualizado_em = now()
     where id`,
    [botTokenCifrado, webhookSecretCifrado, ownerChatIdInformado, ownerChatId ?? null],
  );
}
