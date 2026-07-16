import { env } from "../config/env.js";
import { getTelegramConfig } from "../db/telegramConfig.js";
import { logger } from "./logger.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";

export class TelegramNaoConfiguradoError extends Error {
  constructor() {
    super("Nenhum bot do Telegram esta configurado. Configure o token em /admin.");
  }
}

/** Bot token em uso agora - sempre lido do banco (ver src/db/telegramConfig.ts). */
async function obterBotToken(): Promise<string> {
  const config = await getTelegramConfig();
  if (!config) throw new TelegramNaoConfiguradoError();
  return config.botToken;
}

/**
 * Cliente minimo para a Bot API do Telegram - so o necessario para o
 * esqueleto inicial (enviar mensagem de texto). Sem dependencia externa:
 * a Bot API e HTTP simples o suficiente para nao justificar uma lib inteira.
 */
export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const botToken = await obterBotToken();
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

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

/**
 * Registra a URL publica que o Telegram deve chamar a cada update (ex.: a URL
 * de um tunel ngrok em dev local). Chamado a partir do painel /admin - nao ha
 * caminho automatico porque a URL muda a cada sessao de tunel.
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) throw new TelegramNaoConfiguradoError();

  const url = `${TELEGRAM_API_BASE}/bot${config.botToken}/setWebhook`;
  const body: { url: string; secret_token?: string } = { url: webhookUrl };
  if (config.webhookSecret) body.secret_token = config.webhookSecret;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseBody = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !responseBody.ok) {
    throw new Error(responseBody.description ?? `Telegram setWebhook falhou com status ${response.status}`);
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

  const botToken = await obterBotToken();
  const getFileUrl = `${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${fileId}`;
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

  const downloadUrl = `${TELEGRAM_FILE_BASE}/bot${botToken}/${filePath}`;
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

export interface TelegramBotStatus {
  conectado: boolean;
  botId?: number;
  botUsername?: string;
  botNome?: string;
  webhookUrl: string | null;
  webhookSecretConfigurado: boolean;
  ultimoErroWebhook: string | null;
  erro?: string;
}

/**
 * Status da integracao com o Telegram para o painel de configuracoes -
 * getMe confirma que o token e valido e traz o @username do bot, getWebhookInfo
 * mostra se o webhook esta registrado e o ultimo erro reportado pelo Telegram
 * (util pra diagnosticar sem precisar olhar log do servidor).
 */
export async function getTelegramBotStatus(): Promise<TelegramBotStatus> {
  const config = await getTelegramConfig();
  if (!config) {
    return {
      conectado: false,
      webhookUrl: null,
      webhookSecretConfigurado: false,
      ultimoErroWebhook: null,
      erro: "Nenhum bot configurado - defina o token em /admin.",
    };
  }

  try {
    const [meResponse, webhookResponse] = await Promise.all([
      fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/getMe`),
      fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/getWebhookInfo`),
    ]);

    if (!meResponse.ok) {
      return {
        conectado: false,
        webhookUrl: null,
        webhookSecretConfigurado: Boolean(config.webhookSecret),
        ultimoErroWebhook: null,
        erro: `Telegram getMe falhou com status ${meResponse.status}`,
      };
    }

    const meBody = (await meResponse.json()) as {
      result?: { id: number; username?: string; first_name?: string };
    };
    const webhookBody = webhookResponse.ok
      ? ((await webhookResponse.json()) as {
          result?: { url?: string; last_error_message?: string };
        })
      : null;

    return {
      conectado: true,
      botId: meBody.result?.id,
      botUsername: meBody.result?.username,
      botNome: meBody.result?.first_name,
      webhookUrl: webhookBody?.result?.url || null,
      webhookSecretConfigurado: Boolean(config.webhookSecret),
      ultimoErroWebhook: webhookBody?.result?.last_error_message ?? null,
    };
  } catch (err) {
    return {
      conectado: false,
      webhookUrl: null,
      webhookSecretConfigurado: Boolean(config.webhookSecret),
      ultimoErroWebhook: null,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}
