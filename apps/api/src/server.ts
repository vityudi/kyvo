import Fastify from "fastify";
import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { logger } from "./lib/logger.js";
import { adminRoutes } from "./routes/admin.js";
import { telegramRoutes } from "./routes/telegram.js";
import { iniciarScheduler } from "./scheduler.js";

async function main(): Promise<void> {
  await runMigrations();

  const app = Fastify({ loggerInstance: logger });

  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });

  await app.register(telegramRoutes);
  await app.register(adminRoutes);

  const address = await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info(`servidor escutando em ${address}`);

  iniciarScheduler();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info({ signal }, "encerrando servidor");
      await app.close();
      await pool.end();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error(err, "falha ao iniciar o servidor");
  process.exit(1);
});
