import { timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyBasicAuth from "@fastify/basic-auth";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { obterAnexoParaDownload, type TipoAnexo } from "../db/anexo.js";
import { iniciarNovaConversa, listarConversas, obterConversaComUsuario } from "../db/conversa.js";
import {
  ativarProvedor,
  listarProvedores,
  obterProvedorParaTeste,
  upsertProvedor,
  type LlmProvider,
} from "../db/llmConfig.js";
import { carregarMensagensPaginado } from "../db/mensagem.js";
import type { AnexoPendente, TurnoUsuario } from "../lib/agent.js";
import { processarMensagem } from "../lib/agent.js";
import { createAnthropicClient } from "../lib/llm/anthropicClient.js";
import { createDeepseekClient } from "../lib/llm/deepseekClient.js";
import { LlmNaoConfiguradoError } from "../lib/llm/index.js";
import type { ContentPart } from "../lib/llm/types.js";
import { salvarArquivo, streamArquivo } from "../lib/storage.js";
import { getTelegramBotStatus, sendTelegramMessage } from "../lib/telegram.js";

function tipoAnexoPorMime(mimeType: string): TipoAnexo {
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("audio/")) return "audio";
  return "documento";
}

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
 * Painel de administracao - SPA de conversas/config de provedor de LLM,
 * servida na raiz (/) para acesso direto. Protegido por HTTP Basic Auth em
 * todas as rotas, incluindo os arquivos estaticos da SPA - so registrado no
 * processo `app` (server.ts), o worker nao tem superficie HTTP. As rotas
 * `/health` e `/webhook/telegram`, registradas fora deste plugin, continuam
 * sem autenticacao (hook `onRequest` e escopado a este plugin).
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyBasicAuth, { validate, authenticate: true });
  app.addHook("onRequest", app.basicAuth);

  await app.register(fastifyMultipart, {
    limits: { fileSize: env.MAX_ANEXO_BYTES, files: 1 },
  });

  await app.register(fastifyStatic, {
    root: join(__dirname, "../../admin-ui/dist"),
    prefix: "/",
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

  app.get("/admin/api/telegram/status", async () => getTelegramBotStatus());

  app.get("/admin/api/integracoes", async () => ({
    groqConfigurado: Boolean(env.GROQ_API_KEY),
    pluggyConfigurado: Boolean(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET),
  }));

  app.get("/admin/api/conversas", async () => listarConversas());

  app.post<{ Params: { usuarioId: string } }>("/admin/api/usuarios/:usuarioId/conversas", async (request) =>
    iniciarNovaConversa(request.params.usuarioId),
  );

  app.get<{ Params: { conversaId: string }; Querystring: { antes?: string; limite?: string } }>(
    "/admin/api/conversas/:conversaId/mensagens",
    async (request) => {
      const { conversaId } = request.params;
      const { antes, limite } = request.query;
      return carregarMensagensPaginado(conversaId, antes, limite ? Number(limite) : undefined);
    },
  );

  app.post<{ Params: { conversaId: string } }>("/admin/api/conversas/:conversaId/mensagens", async (request, reply) => {
    const conversa = await obterConversaComUsuario(request.params.conversaId);
    if (!conversa) {
      return reply.code(404).send({ ok: false, erro: "conversa nao encontrada" });
    }

    let texto = "";
    const conteudoParaLlm: ContentPart[] = [];
    const anexosParaPersistir: AnexoPendente[] = [];

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "texto") {
          texto = String(part.value);
          continue;
        }
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          const mimeType = part.mimetype || "application/octet-stream";
          const salvo = await salvarArquivo(buffer, mimeType);
          const tipo = tipoAnexoPorMime(mimeType);

          if (tipo === "imagem") {
            conteudoParaLlm.push({ type: "image", mimeType, data: buffer.toString("base64") });
          } else if (mimeType === "application/pdf") {
            conteudoParaLlm.push({ type: "document", mimeType, data: buffer.toString("base64"), nome: part.filename });
          }

          anexosParaPersistir.push({
            tipo,
            mimeType,
            nomeArquivo: part.filename,
            caminhoArmazenamento: salvo.caminho,
            tamanhoBytes: salvo.tamanhoBytes,
          });
        }
      }
    } else {
      const body = request.body as { texto?: string } | undefined;
      texto = body?.texto ?? "";
    }

    if (!texto && anexosParaPersistir.length === 0) {
      return reply.code(400).send({ ok: false, erro: "mensagem vazia" });
    }

    try {
      const turno: TurnoUsuario = { texto, conteudoParaLlm, anexosParaPersistir };
      const resposta = await processarMensagem(conversa.id, conversa.usuarioId, turno);
      await sendTelegramMessage(conversa.telegramChatId, resposta);
      return { ok: true, resposta };
    } catch (err) {
      const erro =
        err instanceof LlmNaoConfiguradoError
          ? "Ainda não estou configurado — configure um provedor de IA nesta página."
          : "Deu um erro processando essa mensagem.";
      return reply.code(502).send({ ok: false, erro });
    }
  });

  app.get<{ Params: { anexoId: string } }>("/admin/api/anexos/:anexoId", async (request, reply) => {
    const anexo = await obterAnexoParaDownload(request.params.anexoId);
    if (!anexo) {
      return reply.code(404).send({ ok: false, erro: "anexo nao encontrado" });
    }

    reply.header("Content-Type", anexo.mimeType);
    if (anexo.nomeArquivo) {
      reply.header("Content-Disposition", `inline; filename="${anexo.nomeArquivo.replace(/"/g, "")}"`);
    }
    return reply.send(streamArquivo(anexo.caminhoArmazenamento));
  });
}
