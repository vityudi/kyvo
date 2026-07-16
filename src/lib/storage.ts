import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

/**
 * Armazenamento de anexos (imagem/audio/documento) - filesystem local sob
 * UPLOADS_DIR, sem infra de nuvem hoje (escala pequena, deploy de processo
 * unico). Interface pequena de proposito, pra trocar por S3/R2 depois sem
 * mexer em quem chama (Telegram webhook, rota admin de anexos).
 */

const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
};

function extensaoParaMime(mimeType: string): string {
  return EXTENSAO_POR_MIME[mimeType] ?? "";
}

export interface ArquivoSalvo {
  caminho: string;
  tamanhoBytes: number;
}

/** Salva o buffer sob um nome aleatorio dentro de UPLOADS_DIR; retorna o caminho relativo salvo no banco. */
export async function salvarArquivo(buffer: Buffer, mimeType: string): Promise<ArquivoSalvo> {
  await mkdir(env.UPLOADS_DIR, { recursive: true });

  const nomeArquivo = `${randomUUID()}${extensaoParaMime(mimeType)}`;
  const caminhoAbsoluto = path.join(env.UPLOADS_DIR, nomeArquivo);
  await writeFile(caminhoAbsoluto, buffer);

  return { caminho: nomeArquivo, tamanhoBytes: buffer.byteLength };
}

export async function lerArquivo(caminho: string): Promise<Buffer> {
  return readFile(path.join(env.UPLOADS_DIR, caminho));
}

/** Usado pela rota de download admin - evita carregar o arquivo inteiro na memoria. */
export function streamArquivo(caminho: string) {
  return createReadStream(path.join(env.UPLOADS_DIR, caminho));
}
