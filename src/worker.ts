import cron from "node-cron";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { logger } from "./lib/logger.js";

/**
 * Processo separado do servidor web (ver docs/FOUNDATION.md, secao 3): roda
 * as tarefas que nao sao reacao direta a uma mensagem do usuario -
 * verificacao de orcamentos/metas para alertas proativos, e a consolidacao
 * periodica de memoria/insights (docs/RAG_MEMORY_ARCHITECTURE.md, secao 5).
 *
 * TODO (Fase 2): implementar as tarefas reais. Por enquanto so demonstra o
 * agendamento rodando e a conexao com o banco funcionando.
 */
async function verificarOrcamentosEMetas(): Promise<void> {
  const { rowCount } = await pool.query("SELECT 1 FROM usuario LIMIT 1");
  logger.info({ usuariosExistem: (rowCount ?? 0) > 0 }, "[worker] verificacao de orcamentos/metas (stub)");
}

async function main(): Promise<void> {
  await runMigrations();

  // A cada hora - cadencia provisoria, ajustar quando os alertas reais forem
  // implementados (docs/FOUNDATION.md, roadmap Fase 2).
  cron.schedule("0 * * * *", () => {
    verificarOrcamentosEMetas().catch((err) => logger.error(err, "[worker] falha na verificacao"));
  });

  logger.info("worker iniciado - agendamentos ativos");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info({ signal }, "encerrando worker");
      await pool.end();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error(err, "falha ao iniciar o worker");
  process.exit(1);
});
