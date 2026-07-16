import { decrypt, encrypt } from "../lib/crypto.js";
import { pool } from "./pool.js";

export type LlmProvider = "anthropic" | "deepseek";

export interface LlmConfigAtivo {
  provider: LlmProvider;
  modelo: string;
  apiKey: string;
}

export interface ProvedorResumo {
  provider: LlmProvider;
  modelo: string;
  ativo: boolean;
  chaveConfigurada: boolean;
  atualizadoEm: string;
}

/**
 * Config de LLM em uso agora. Sem cache: trafego de um bot pessoal e baixo e
 * a query e um lookup indexado unico - assim a proxima mensagem ja reflete
 * uma troca de provider feita no painel, sem invalidacao manual.
 */
export async function getActiveLlmConfig(): Promise<LlmConfigAtivo | null> {
  const { rows } = await pool.query<{ provider: LlmProvider; modelo: string; api_key_cifrada: string | null }>(
    "select provider, modelo, api_key_cifrada from llm_provedor where ativo limit 1",
  );

  const row = rows[0];
  if (!row || !row.api_key_cifrada) return null;

  return { provider: row.provider, modelo: row.modelo, apiKey: decrypt(row.api_key_cifrada) };
}

export async function listarProvedores(): Promise<ProvedorResumo[]> {
  const { rows } = await pool.query<{
    provider: LlmProvider;
    modelo: string;
    ativo: boolean;
    chave_configurada: boolean;
    atualizado_em: string;
  }>(
    `select provider, modelo, ativo, (api_key_cifrada is not null) as chave_configurada, atualizado_em
     from llm_provedor
     order by provider`,
  );

  return rows.map((r) => ({
    provider: r.provider,
    modelo: r.modelo,
    ativo: r.ativo,
    chaveConfigurada: r.chave_configurada,
    atualizadoEm: r.atualizado_em,
  }));
}

/**
 * Atualiza modelo e, se informada, a API key de um provedor. A key so e
 * sobrescrita quando `apiKeyPlain` vem preenchida - permite salvar so o
 * modelo sem reenviar a key (a UI nunca devolve a key real ao cliente).
 */
export async function upsertProvedor(provider: LlmProvider, modelo: string, apiKeyPlain?: string): Promise<void> {
  const apiKeyCifrada = apiKeyPlain ? encrypt(apiKeyPlain) : null;

  await pool.query(
    `update llm_provedor
     set modelo = $2,
         api_key_cifrada = coalesce($3, api_key_cifrada),
         atualizado_em = now()
     where provider = $1`,
    [provider, modelo, apiKeyCifrada],
  );
}

export async function ativarProvedor(provider: LlmProvider): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("update llm_provedor set ativo = false where ativo");
    await client.query("update llm_provedor set ativo = true, atualizado_em = now() where provider = $1", [
      provider,
    ]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function obterProvedorParaTeste(provider: LlmProvider): Promise<{ modelo: string; apiKey: string } | null> {
  const { rows } = await pool.query<{ modelo: string; api_key_cifrada: string | null }>(
    "select modelo, api_key_cifrada from llm_provedor where provider = $1",
    [provider],
  );

  const row = rows[0];
  if (!row || !row.api_key_cifrada) return null;

  return { modelo: row.modelo, apiKey: decrypt(row.api_key_cifrada) };
}
