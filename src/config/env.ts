import "dotenv/config";
import { z } from "zod";

/**
 * Toda variavel de ambiente do projeto passa por aqui. Falhar rapido e com
 * mensagem clara na inicializacao evita descobrir uma env faltando so quando
 * uma tool falha no meio de uma conversa com o usuario.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY e obrigatoria - veja .env.example"),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),

  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN e obrigatoria - veja .env.example"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Embeddings (RAG/memoria) - ainda nao usados no esqueleto inicial, mas ja
  // validados aqui para falhar cedo quando essa camada for implementada.
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODEL: z.string().default("voyage-3"),

  // Open Finance (Fase 2+) - opcional no esqueleto inicial.
  PLUGGY_CLIENT_ID: z.string().optional(),
  PLUGGY_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuracao invalida - confira as variaveis de ambiente:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
