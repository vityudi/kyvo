import { env } from "../config/env.js";
import { pool } from "./pool.js";
import { upsertTelegramConfig } from "./telegramConfig.js";

/**
 * Bootstrap opcional para dev local: se TELEGRAM_BOT_TOKEN_BOOTSTRAP estiver
 * setada, configura o bot do Telegram - evita ter que abrir /admin so pra
 * rodar `docker compose up` localmente. Sem efeito em runtime normal (o bot
 * sempre le a config do banco, nunca deste script).
 */
async function seed(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN_BOOTSTRAP) {
    console.log("[seed:telegram-config] TELEGRAM_BOT_TOKEN_BOOTSTRAP nao definida - nada a fazer");
    return;
  }

  await upsertTelegramConfig(env.TELEGRAM_BOT_TOKEN_BOOTSTRAP, env.TELEGRAM_WEBHOOK_SECRET_BOOTSTRAP);
  console.log("[seed:telegram-config] bot do Telegram configurado a partir do bootstrap");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
