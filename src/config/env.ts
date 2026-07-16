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

  // Chave mestra de cifragem (AES-256-GCM) das API keys de LLM guardadas no
  // banco - gere com: openssl rand -hex 32
  CONFIG_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "CONFIG_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)"),

  // Senha do painel /admin (usuario fixo "admin", HTTP Basic Auth). Sem
  // exigencia de tamanho minimo por escolha do time - troque por algo mais
  // forte antes de expor o painel fora de localhost.
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD e obrigatoria - veja .env.example"),

  // Bootstrap opcional (dev local): seeda o bot do Telegram no primeiro boot
  // via `npm run seed:telegram-config` - evita ter que abrir /admin so pra
  // rodar localmente. Sem efeito em runtime normal (o bot sempre le do banco,
  // configuravel via painel /admin).
  TELEGRAM_BOT_TOKEN_BOOTSTRAP: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET_BOOTSTRAP: z.string().optional(),

  // Anexos de mensagem (imagem/audio/documento) - armazenados no filesystem
  // local (sem infra de nuvem hoje, ver src/lib/storage.ts).
  UPLOADS_DIR: z.string().default("./uploads"),
  MAX_ANEXO_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),

  // Bootstrap opcional (dev local): seeda a chave da Groq (transcricao) no
  // primeiro boot via `npm run seed:groq-config`. Nao e lido em nenhum
  // caminho de request normal - a transcricao le sempre do banco.
  GROQ_API_KEY_BOOTSTRAP: z.string().optional(),

  // Bootstrap opcional (dev local): seeda o provedor Anthropic no primeiro
  // boot via `npm run seed:llm-config`. Nao e lido em nenhum caminho de
  // request normal - config de LLM em runtime vem sempre do banco.
  ANTHROPIC_API_KEY_BOOTSTRAP: z.string().optional(),

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
