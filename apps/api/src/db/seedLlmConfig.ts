import { env } from "../config/env.js";
import { ativarProvedor, upsertProvedor } from "./llmConfig.js";
import { pool } from "./pool.js";

/**
 * Bootstrap opcional para dev local: se ANTHROPIC_API_KEY_BOOTSTRAP estiver
 * setada, configura e ativa o provedor Anthropic - evita ter que abrir /web
 * so pra rodar `docker compose up` localmente. Sem efeito em runtime normal
 * (o agente sempre le a config do banco, nunca deste script).
 */
async function seed(): Promise<void> {
  if (!env.ANTHROPIC_API_KEY_BOOTSTRAP) {
    console.log("[seed:llm-config] ANTHROPIC_API_KEY_BOOTSTRAP nao definida - nada a fazer");
    return;
  }

  await upsertProvedor("anthropic", "claude-opus-4-8", env.ANTHROPIC_API_KEY_BOOTSTRAP);
  await ativarProvedor("anthropic");
  console.log("[seed:llm-config] provedor anthropic configurado e ativado a partir do bootstrap");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
