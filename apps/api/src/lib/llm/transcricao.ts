import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getGroqApiKey } from "../../db/groqConfig.js";
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
 * Retorna null (nunca lanca) quando a chave da Groq nao esta configurada em
 * /web, ou se a chamada falhar - a mensagem de audio ainda fica salva como
 * anexo, so sem o texto transcrito chegando ao agente.
 */
export async function transcreverAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = await getGroqApiKey();
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
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

const EXTENSAO_POR_MIME: Record<string, string> = {
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/m4a": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/flac": ".flac",
};

/**
 * O Whisper da Groq valida o tipo do arquivo pela extensao do nome, nao pelo
 * `type` do blob - por isso a extensao precisa bater com uma das aceitas
 * ([flac mp3 mp4 mpeg mpga m4a ogg opus wav webm]). O Content-Type que o
 * Telegram devolve no download do voice note costuma vir com parametros (ex.:
 * "audio/ogg; codecs=opus"), entao normalizamos antes de comparar. Sem
 * correspondencia, ".ogg" e o fallback seguro pois e o formato quase
 * universal de voice note do Telegram.
 */
function extensaoParaMime(mimeType: string): string {
  const tipoBase = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSAO_POR_MIME[tipoBase] ?? ".ogg";
}
