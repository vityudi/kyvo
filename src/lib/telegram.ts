import { env } from "../config/env.js";
import { logger } from "./logger.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";

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
    // Telegram manda a legenda em `caption`, nao em `text`, quando a mensagem
    // tem foto/audio/documento anexado.
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
    voice?: { file_id: string; mime_type?: string; file_size?: number };
    audio?: { file_id: string; mime_type?: string; file_size?: number; file_name?: string };
    document?: { file_id: string; mime_type?: string; file_size?: number; file_name?: string };
  };
}

export class ArquivoTelegramGrandeDemaisError extends Error {
  constructor(fileSize: number) {
    super(`arquivo do Telegram (${fileSize} bytes) excede o limite de ${env.MAX_ANEXO_BYTES} bytes`);
  }
}

/**
 * Baixa um arquivo do Telegram a partir do file_id: primeiro resolve o
 * file_path via getFile, depois baixa o binario do endpoint de arquivos
 * (que e separado do endpoint de API normal).
 */
export async function baixarArquivoTelegram(
  fileId: string,
  tamanhoConhecido?: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (tamanhoConhecido && tamanhoConhecido > env.MAX_ANEXO_BYTES) {
    throw new ArquivoTelegramGrandeDemaisError(tamanhoConhecido);
  }

  const getFileUrl = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const getFileResponse = await fetch(getFileUrl);
  if (!getFileResponse.ok) {
    throw new Error(`Telegram getFile falhou com status ${getFileResponse.status}`);
  }

  const getFileBody = (await getFileResponse.json()) as { result?: { file_path?: string; file_size?: number } };
  const filePath = getFileBody.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile nao retornou file_path");

  if (getFileBody.result?.file_size && getFileBody.result.file_size > env.MAX_ANEXO_BYTES) {
    throw new ArquivoTelegramGrandeDemaisError(getFileBody.result.file_size);
  }

  const downloadUrl = `${TELEGRAM_FILE_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) {
    throw new Error(`download de arquivo do Telegram falhou com status ${downloadResponse.status}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const mimeType = downloadResponse.headers.get("content-type") ?? inferirMimeTypePorExtensao(filePath);

  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

function inferirMimeTypePorExtensao(filePath: string): string {
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ogg") || filePath.endsWith(".oga")) return "audio/ogg";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
