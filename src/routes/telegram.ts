import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { obterOuCriarUsuario } from "../db/usuario.js";
import { processarMensagem } from "../lib/agent.js";
import { LlmNaoConfiguradoError } from "../lib/llm/index.js";
import { logger } from "../lib/logger.js";
import { sendTelegramMessage, type TelegramUpdate } from "../lib/telegram.js";

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: TelegramUpdate }>("/webhook/telegram", async (request, reply) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers["x-telegram-bot-api-secret-token"];
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        logger.warn({ ip: request.ip }, "webhook do Telegram rejeitado - secret invalido");
        return reply.code(401).send({ error: "unauthorized" });
      }
    }

    const update = request.body;
    const message = update.message;

    // Responder 200 sempre e rapido, mesmo para updates que nao processamos
    // (ex.: edicao de mensagem, membro entrando no grupo) - o Telegram
    // reenvia updates que nao sao confirmados.
    if (!message?.text) {
      return reply.code(200).send({ ok: true });
    }

    const usuario = await obterOuCriarUsuario(message.chat.id);
    logger.info({ usuarioId: usuario.id, texto: message.text }, "mensagem recebida");

    try {
      const resposta = await processarMensagem(usuario.id, message.text);
      await sendTelegramMessage(message.chat.id, resposta);
    } catch (err) {
      logger.error({ err, usuarioId: usuario.id }, "falha ao processar mensagem com o agente");
      const resposta =
        err instanceof LlmNaoConfiguradoError
          ? "Ainda não estou configurado — peça para quem administra o bot configurar um provedor de IA em /admin."
          : "Deu um erro aqui do meu lado processando sua mensagem. Pode tentar de novo?";
      await sendTelegramMessage(message.chat.id, resposta);
    }

    return reply.code(200).send({ ok: true });
  });
}
