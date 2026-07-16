import { decrypt, encrypt } from "../lib/crypto.js";
import { pool } from "./pool.js";

export interface GroqConfigResumo {
  apiKeyConfigurada: boolean;
  atualizadoEm: string;
}

/**
 * Chave em uso agora pela transcricao de audio. Sem cache, mesmo raciocinio
 * de getTelegramConfig/getActiveLlmConfig - troca no painel /admin vale ja
 * no proximo audio recebido.
 */
export async function getGroqApiKey(): Promise<string | null> {
  const { rows } = await pool.query<{ api_key_cifrada: string | null }>(
    "select api_key_cifrada from groq_config where id",
  );

  const row = rows[0];
  if (!row || !row.api_key_cifrada) return null;

  return decrypt(row.api_key_cifrada);
}

export async function obterResumoGroqConfig(): Promise<GroqConfigResumo> {
  const { rows } = await pool.query<{ api_key_cifrada: string | null; atualizado_em: string }>(
    "select api_key_cifrada, atualizado_em from groq_config where id",
  );

  const row = rows[0];
  return {
    apiKeyConfigurada: Boolean(row?.api_key_cifrada),
    atualizadoEm: row?.atualizado_em ?? new Date().toISOString(),
  };
}

/**
 * Atualiza a API key. So sobrescreve quando `apiKeyPlain` vem preenchida - a
 * UI nunca devolve a key real ao cliente depois de salva.
 */
export async function upsertGroqConfig(apiKeyPlain?: string): Promise<void> {
  const apiKeyCifrada = apiKeyPlain ? encrypt(apiKeyPlain) : null;

  await pool.query(
    `update groq_config
     set api_key_cifrada = coalesce($1, api_key_cifrada),
         atualizado_em = now()
     where id`,
    [apiKeyCifrada],
  );
}
