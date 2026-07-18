import { timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyBasicAuth from "@fastify/basic-auth";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { obterAnexoParaDownload, type TipoAnexo } from "../db/anexo.js";
import { deletarConversa, iniciarNovaConversa, listarConversas, obterConversaComUsuario } from "../db/conversa.js";
import {
  ativarProvedor,
  listarProvedores,
  obterProvedorParaTeste,
  upsertProvedor,
  type LlmProvider,
} from "../db/llmConfig.js";
import { obterResumoGroqConfig, upsertGroqConfig } from "../db/groqConfig.js";
import { carregarMensagensPaginado } from "../db/mensagem.js";
import { obterResumoTelegramConfig, upsertTelegramConfig } from "../db/telegramConfig.js";
import type { AnexoPendente, TurnoUsuario } from "../lib/agent.js";
import { processarMensagem } from "../lib/agent.js";
import { createAnthropicClient } from "../lib/llm/anthropicClient.js";
import { createDeepseekClient } from "../lib/llm/deepseekClient.js";
import { LlmNaoConfiguradoError } from "../lib/llm/index.js";
import type { ContentPart } from "../lib/llm/types.js";
import { salvarArquivo, streamArquivo } from "../lib/storage.js";
import {
  getTelegramBotStatus,
  sendTelegramMessageComRetentativa,
  setTelegramCommands,
  setTelegramWebhook,
} from "../lib/telegram.js";

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
 * Painel web - SPA de conversas/config de provedor de LLM,
 * servida na raiz (/) para acesso direto. Protegido por HTTP Basic Auth em
 * todas as rotas, incluindo os arquivos estaticos da SPA. As rotas
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
    root: join(__dirname, "../../web/dist"),
    prefix: "/",
  });

  app.get("/web/api/providers", async () => listarProvedores());

  app.put<{ Params: { provider: string }; Body: { modelo: string; apiKey?: string } }>(
    "/web/api/providers/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!isValidProvider(provider)) {
        return reply.code(400).send({ ok: false, erro: "provider invalido" });
      }
      await upsertProvedor(provider, request.body.modelo, request.body.apiKey);
      return { ok: true };
    },
  );

  app.post<{ Params: { provider: string } }>("/web/api/providers/:provider/ativar", async (request, reply) => {
    const { provider } = request.params;
    if (!isValidProvider(provider)) {
      return reply.code(400).send({ ok: false, erro: "provider invalido" });
    }
    await ativarProvedor(provider);
    return { ok: true };
  });

  app.post<{ Params: { provider: string } }>("/web/api/providers/:provider/testar", async (request, reply) => {
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

  app.get("/web/api/telegram/status", async () => getTelegramBotStatus());

  app.get("/web/api/telegram/config", async () => obterResumoTelegramConfig());

  app.put<{ Body: { botToken?: string; webhookSecret?: string; ownerChatId?: number | null } }>(
    "/web/api/telegram/config",
    async (request, reply) => {
      const { botToken, webhookSecret, ownerChatId } = request.body;
      if (!botToken && !webhookSecret && ownerChatId === undefined) {
        return reply.code(400).send({ ok: false, erro: "informe o bot token, o secret do webhook e/ou o chat autorizado" });
      }
      await upsertTelegramConfig(botToken, webhookSecret, ownerChatId ?? null);

      // So pra tornar /nova descobrivel no menu de comandos do Telegram -
      // best-effort, um bot token novo/invalido nao deve impedir o salvamento
      // da config em si.
      if (botToken) {
        try {
          await setTelegramCommands();
        } catch (err) {
          app.log.warn({ err }, "falha ao registrar menu de comandos do Telegram");
        }
      }

      return { ok: true };
    },
  );

  app.post<{ Body: { url: string } }>("/web/api/telegram/webhook", async (request, reply) => {
    const { url } = request.body;
    if (!url) {
      return reply.code(400).send({ ok: false, erro: "informe a URL publica do webhook" });
    }

    try {
      const urlCompleta = url.endsWith("/webhook/telegram") ? url : `${url.replace(/\/$/, "")}/webhook/telegram`;
      await setTelegramWebhook(urlCompleta);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/web/api/groq/config", async () => obterResumoGroqConfig());

  app.put<{ Body: { apiKey?: string } }>("/web/api/groq/config", async (request, reply) => {
    const { apiKey } = request.body;
    if (!apiKey) {
      return reply.code(400).send({ ok: false, erro: "informe a API key da Groq" });
    }
    await upsertGroqConfig(apiKey);
    return { ok: true };
  });

  app.get("/web/api/integracoes", async () => ({
    pluggyConfigurado: Boolean(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET),
  }));

  app.get("/web/api/conversas", async () => listarConversas());

  app.post<{ Params: { usuarioId: string } }>("/web/api/usuarios/:usuarioId/conversas", async (request) =>
    iniciarNovaConversa(request.params.usuarioId),
  );

  app.delete<{ Params: { conversaId: string } }>("/web/api/conversas/:conversaId", async (request, reply) => {
    const apagada = await deletarConversa(request.params.conversaId);
    if (!apagada) {
      return reply.code(404).send({ ok: false, erro: "conversa nao encontrada" });
    }
    return { ok: true };
  });

  app.get<{ Params: { conversaId: string }; Querystring: { antes?: string; limite?: string } }>(
    "/web/api/conversas/:conversaId/mensagens",
    async (request) => {
      const { conversaId } = request.params;
      const { antes, limite } = request.query;
      return carregarMensagensPaginado(conversaId, antes, limite ? Number(limite) : undefined);
    },
  );

  app.post<{ Params: { conversaId: string } }>("/web/api/conversas/:conversaId/mensagens", async (request, reply) => {
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

    // O bot nao consegue postar no Telegram "como se fosse" o usuario (limitacao
    // da Bot API) - sem isso, quem manda mensagem pelo painel via essa mensagem
    // nunca aparece no chat real do Telegram, so a resposta do assistente.
    // Ecoa antes de processar para preservar a ordem (pergunta, depois resposta).
    const partesEco: string[] = [];
    if (texto) partesEco.push(texto);
    if (anexosParaPersistir.length > 0) {
      partesEco.push(`[${anexosParaPersistir.length} anexo(s) enviado(s) pelo painel]`);
    }
    await sendTelegramMessageComRetentativa(
      conversa.telegramChatId,
      `🖥️ Mensagem enviada pelo painel:\n${partesEco.join("\n")}`,
    );

    let resposta: string;
    try {
      const turno: TurnoUsuario = { texto, conteudoParaLlm, anexosParaPersistir };
      resposta = await processarMensagem(conversa.id, conversa.usuarioId, turno);
    } catch (err) {
      const erro =
        err instanceof LlmNaoConfiguradoError
          ? "Ainda não estou configurado — configure um provedor de IA nesta página."
          : "Deu um erro processando essa mensagem.";
      return reply.code(502).send({ ok: false, erro });
    }

    // Entrega ao Telegram e uma etapa a parte do processamento: a resposta ja
    // foi persistida em `mensagem` acima, entao uma falha transitoria so na
    // entrega nao deve virar um 502 aqui - o painel e o Telegram devem
    // sempre concordar sobre o que de fato aconteceu na conversa.
    await sendTelegramMessageComRetentativa(conversa.telegramChatId, resposta);
    return { ok: true, resposta };
  });

  app.get<{ Params: { anexoId: string } }>("/web/api/anexos/:anexoId", async (request, reply) => {
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
