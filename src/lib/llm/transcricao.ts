import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * Transcreve audio (voz do Telegram) via Groq, que expoe um endpoint
 * compativel com o SDK `openai` (mesmo truque de baseURL de deepseekClient.ts)
 * - evita depender de mais uma lib so pra isso. Nenhuma API de LLM usada
 * neste projeto aceita audio bruto como input, entao esse passo e sempre
 * necessario antes de dar o conteudo falado pro agente.
 *
 * Retorna null (nunca lanca) quando GROQ_API_KEY nao esta configurada, ou se
 * a chamada falhar - a mensagem de audio ainda fica salva como anexo, so sem
 * o texto transcrito chegando ao agente.
 */
export async function transcreverAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;

  try {
    const client = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
    const arquivo = await toFile(buffer, `audio${extensaoParaMime(mimeType)}`, { type: mimeType });

    const resposta = await client.audio.transcriptions.create({
      file: arquivo,
      model: GROQ_WHISPER_MODEL,
      language: "pt",
    });

    return resposta.text.trim() || null;
  } catch (err) {
    logger.error({ err }, "falha ao transcrever audio via Groq");
    return null;
  }
}

function extensaoParaMime(mimeType: string): string {
  if (mimeType === "audio/ogg") return ".ogg";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4") return ".m4a";
  return "";
}
