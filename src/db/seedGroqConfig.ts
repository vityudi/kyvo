import { env } from "../config/env.js";
import { upsertGroqConfig } from "./groqConfig.js";
import { pool } from "./pool.js";

/**
 * Bootstrap opcional para dev local: se GROQ_API_KEY_BOOTSTRAP estiver
 * setada, configura a chave da Groq - evita ter que abrir /web so pra
 * rodar `docker compose up` localmente. Sem efeito em runtime normal (a
 * transcricao sempre le a chave do banco, nunca deste script).
 */
async function seed(): Promise<void> {
  if (!env.GROQ_API_KEY_BOOTSTRAP) {
    console.log("[seed:groq-config] GROQ_API_KEY_BOOTSTRAP nao definida - nada a fazer");
    return;
  }

  await upsertGroqConfig(env.GROQ_API_KEY_BOOTSTRAP);
  console.log("[seed:groq-config] chave da Groq configurada a partir do bootstrap");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
