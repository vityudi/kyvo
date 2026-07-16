import { decrypt, encrypt } from "../lib/crypto.js";
import { pool } from "./pool.js";

export interface TelegramConfig {
  botToken: string;
  webhookSecret: string | null;
}

export interface TelegramConfigResumo {
  botTokenConfigurado: boolean;
  webhookSecretConfigurado: boolean;
  atualizadoEm: string;
}

/**
 * Config do bot em uso agora. Sem cache, mesmo raciocinio de getActiveLlmConfig
 * (lookup indexado unico, trafego baixo) - troca no painel /admin vale ja na
 * proxima request/mensagem.
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const { rows } = await pool.query<{ bot_token_cifrado: string | null; webhook_secret_cifrado: string | null }>(
    "select bot_token_cifrado, webhook_secret_cifrado from telegram_config where id",
  );

  const row = rows[0];
  if (!row || !row.bot_token_cifrado) return null;

  return {
    botToken: decrypt(row.bot_token_cifrado),
    webhookSecret: row.webhook_secret_cifrado ? decrypt(row.webhook_secret_cifrado) : null,
  };
}

export async function obterResumoTelegramConfig(): Promise<TelegramConfigResumo> {
  const { rows } = await pool.query<{
    bot_token_cifrado: string | null;
    webhook_secret_cifrado: string | null;
    atualizado_em: string;
  }>("select bot_token_cifrado, webhook_secret_cifrado, atualizado_em from telegram_config where id");

  const row = rows[0];
  return {
    botTokenConfigurado: Boolean(row?.bot_token_cifrado),
    webhookSecretConfigurado: Boolean(row?.webhook_secret_cifrado),
    atualizadoEm: row?.atualizado_em ?? new Date().toISOString(),
  };
}

/**
 * Atualiza bot token e/ou webhook secret. So sobrescreve o que vier
 * preenchido - permite salvar um sem mexer no outro (a UI nunca devolve os
 * valores reais ao cliente depois de salvos).
 */
export async function upsertTelegramConfig(botTokenPlain?: string, webhookSecretPlain?: string): Promise<void> {
  const botTokenCifrado = botTokenPlain ? encrypt(botTokenPlain) : null;
  const webhookSecretCifrado = webhookSecretPlain ? encrypt(webhookSecretPlain) : null;

  await pool.query(
    `update telegram_config
     set bot_token_cifrado = coalesce($1, bot_token_cifrado),
         webhook_secret_cifrado = coalesce($2, webhook_secret_cifrado),
         atualizado_em = now()
     where id`,
    [botTokenCifrado, webhookSecretCifrado],
  );
}
