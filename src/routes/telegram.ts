import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { obterOuCriarUsuario } from "../db/usuario.js";
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

    // TODO (Fase 0): substituir este eco pelo loop de agente com tool use.
    // Ver src/lib/anthropic.ts e docs/TOOLS_FASE_0_1.md no repo de planejamento.
    await sendTelegramMessage(
      message.chat.id,
      "Recebi sua mensagem! O registro de gastos via IA ainda esta sendo implementado - " +
        "por enquanto eu so confirmo que o webhook esta funcionando.",
    );

    return reply.code(200).send({ ok: true });
  });
}
