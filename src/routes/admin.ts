import { timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyBasicAuth from "@fastify/basic-auth";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import {
  ativarProvedor,
  listarProvedores,
  obterProvedorParaTeste,
  upsertProvedor,
  type LlmProvider,
} from "../db/llmConfig.js";
import { carregarMensagensPaginado, listarConversas } from "../db/mensagem.js";
import { obterUsuarioPorId } from "../db/usuario.js";
import { processarMensagem } from "../lib/agent.js";
import { createAnthropicClient } from "../lib/llm/anthropicClient.js";
import { createDeepseekClient } from "../lib/llm/deepseekClient.js";
import { LlmNaoConfiguradoError } from "../lib/llm/index.js";
import { sendTelegramMessage } from "../lib/telegram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function isValidProvider(provider: string): provider is LlmProvider {
  return provider === "anthropic" || provider === "deepseek";
}

function validate(
  username: string,
  password: string,
  _req: unknown,
  _reply: unknown,
  done: (err?: Error) => void,
): void {
  const senhaEsperada = Buffer.from(env.ADMIN_PASSWORD);
  const senhaRecebida = Buffer.from(password);
  const ok =
    username === "admin" &&
    senhaRecebida.length === senhaEsperada.length &&
    timingSafeEqual(senhaRecebida, senhaEsperada);
  done(ok ? undefined : new Error("credenciais invalidas"));
}

/**
 * Painel de administracao (/admin) para escolher/configurar o provedor de
 * LLM ativo (Anthropic/DeepSeek) em runtime, sem depender de env vars nem
 * redeploy. Protegido por HTTP Basic Auth em todas as rotas, incluindo os
 * arquivos estaticos da SPA - so registrado no processo `app` (server.ts),
 * o worker nao tem superficie HTTP.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyBasicAuth, { validate, authenticate: true });
  app.addHook("onRequest", app.basicAuth);

  await app.register(fastifyStatic, {
    root: join(__dirname, "../../admin-ui-dist"),
    prefix: "/admin/",
  });

  app.get("/admin/api/providers", async () => listarProvedores());

  app.put<{ Params: { provider: string }; Body: { modelo: string; apiKey?: string } }>(
    "/admin/api/providers/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!isValidProvider(provider)) {
        return reply.code(400).send({ ok: false, erro: "provider invalido" });
      }
      await upsertProvedor(provider, request.body.modelo, request.body.apiKey);
      return { ok: true };
    },
  );

  app.post<{ Params: { provider: string } }>("/admin/api/providers/:provider/ativar", async (request, reply) => {
    const { provider } = request.params;
    if (!isValidProvider(provider)) {
      return reply.code(400).send({ ok: false, erro: "provider invalido" });
    }
    await ativarProvedor(provider);
    return { ok: true };
  });

  app.post<{ Params: { provider: string } }>("/admin/api/providers/:provider/testar", async (request, reply) => {
    const { provider } = request.params;
    if (!isValidProvider(provider)) {
      return reply.code(400).send({ ok: false, erro: "provider invalido" });
    }

    const config = await obterProvedorParaTeste(provider);
    if (!config) {
      return reply.code(400).send({ ok: false, erro: "chave nao configurada" });
    }

    const client =
      provider === "anthropic"
        ? createAnthropicClient(config.apiKey, config.modelo)
        : createDeepseekClient(config.apiKey, config.modelo);

    try {
      await client.createCompletion({
        messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }],
        tools: [],
        maxTokens: 8,
      });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/admin/api/conversas", async () => listarConversas());

  app.get<{ Params: { usuarioId: string }; Querystring: { antes?: string; limite?: string } }>(
    "/admin/api/conversas/:usuarioId/mensagens",
    async (request) => {
      const { usuarioId } = request.params;
      const { antes, limite } = request.query;
      return carregarMensagensPaginado(usuarioId, antes, limite ? Number(limite) : undefined);
    },
  );

  app.post<{ Params: { usuarioId: string }; Body: { texto: string } }>(
    "/admin/api/conversas/:usuarioId/mensagens",
    async (request, reply) => {
      const usuario = await obterUsuarioPorId(request.params.usuarioId);
      if (!usuario) {
        return reply.code(404).send({ ok: false, erro: "usuario nao encontrado" });
      }

      try {
        const resposta = await processarMensagem(usuario.id, request.body.texto);
        await sendTelegramMessage(usuario.telegram_chat_id, resposta);
        return { ok: true, resposta };
      } catch (err) {
        const erro =
          err instanceof LlmNaoConfiguradoError
            ? "Ainda não estou configurado — configure um provedor de IA nesta página."
            : "Deu um erro processando essa mensagem.";
        return reply.code(502).send({ ok: false, erro });
      }
    },
  );
}
