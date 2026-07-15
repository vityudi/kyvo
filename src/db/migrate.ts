import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

// Numero arbitrario fixo, so precisa ser o mesmo em todo processo que roda
// migrations (server.ts e worker.ts podem subir ao mesmo tempo no docker
// compose - o lock garante que so um deles aplique migrations por vez).
const MIGRATION_LOCK_ID = 726_611_004;

/**
 * Aplica as migrations pendentes em db/migrations, em ordem alfabetica.
 * Idempotente: seguro de chamar toda vez que o processo sobe.
 */
export async function runMigrations(targetPool: Pool = pool): Promise<void> {
  const client = await targetPool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        nome        text PRIMARY KEY,
        aplicada_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    const arquivos = (await readdir(MIGRATIONS_DIR))
      .filter((nome) => nome.endsWith(".sql"))
      .sort();

    const { rows } = await client.query<{ nome: string }>("SELECT nome FROM _migrations");
    const aplicadas = new Set(rows.map((r) => r.nome));

    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, arquivo), "utf8");

      console.log(`[migrate] aplicando ${arquivo}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (nome) VALUES ($1)", [arquivo]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Falha ao aplicar migration ${arquivo}: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    client.release();
  }
}

// Permite rodar `npm run migrate` isoladamente, alem de ser chamado no boot
// de server.ts/worker.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log("[migrate] concluido");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
