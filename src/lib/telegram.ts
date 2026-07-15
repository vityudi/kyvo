import { env } from "../config/env.js";
import { logger } from "./logger.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Cliente minimo para a Bot API do Telegram - so o necessario para o
 * esqueleto inicial (enviar mensagem de texto). Sem dependencia externa:
 * a Bot API e HTTP simples o suficiente para nao justificar uma lib inteira.
 */
export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ chatId, status: response.status, body }, "falha ao enviar mensagem no Telegram");
    throw new Error(`Telegram sendMessage falhou com status ${response.status}`);
  }
}

/** Formato minimo de um update do Telegram - so os campos usados hoje. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}
