import type { FastifyInstance } from "fastify";
import type { AnexoPendente, TurnoUsuario } from "../lib/agent.js";
import { processarMensagem } from "../lib/agent.js";
import { getTelegramConfig } from "../db/telegramConfig.js";
import { iniciarNovaConversa, obterOuCriarConversaAtiva } from "../db/conversa.js";
import { obterOuCriarUsuario } from "../db/usuario.js";
import { LlmNaoConfiguradoError } from "../lib/llm/index.js";
import type { ContentPart } from "../lib/llm/types.js";
import { transcreverAudio } from "../lib/llm/transcricao.js";
import { logger } from "../lib/logger.js";
import { salvarArquivo } from "../lib/storage.js";
import {
  ArquivoTelegramGrandeDemaisError,
  baixarArquivoTelegram,
  sendTelegramMessage,
  type TelegramUpdate,
} from "../lib/telegram.js";

const COMANDOS_NOVA_CONVERSA = ["/nova", "/reset"];

interface AnexosProcessados {
  textoAdicional: string;
  conteudoParaLlm: ContentPart[];
  anexosParaPersistir: AnexoPendente[];
}

/**
 * Baixa e persiste em disco cada anexo presente na mensagem, monta os
 * ContentPart de imagem/PDF pro LLM e transcreve audio (voz). Uma falha ao
 * processar um anexo individual (ex.: arquivo grande demais) nao derruba a
 * mensagem inteira - so aquele anexo e ignorado, com um aviso no texto.
 */
async function processarAnexos(message: NonNullable<TelegramUpdate["message"]>): Promise<AnexosProcessados> {
  const avisos: string[] = [];
  const conteudoParaLlm: ContentPart[] = [];
  const anexosParaPersistir: AnexoPendente[] = [];

  async function baixarESalvar(fileId: string, fileSize: number | undefined) {
    const { buffer, mimeType } = await baixarArquivoTelegram(fileId, fileSize);
    const salvo = await salvarArquivo(buffer, mimeType);
    return { buffer, mimeType, ...salvo };
  }

  try {
    const foto = message.photo?.at(-1);
    if (foto) {
      const { buffer, mimeType, caminho, tamanhoBytes } = await baixarESalvar(foto.file_id, foto.file_size);
      conteudoParaLlm.push({ type: "image", mimeType, data: buffer.toString("base64") });
      anexosParaPersistir.push({
        tipo: "imagem",
        mimeType,
        caminhoArmazenamento: caminho,
        tamanhoBytes,
        telegramFileId: foto.file_id,
      });
    }

    const voz = message.voice ?? message.audio;
    if (voz) {
      const { buffer, mimeType, caminho, tamanhoBytes } = await baixarESalvar(voz.file_id, voz.file_size);
      const transcricao = await transcreverAudio(buffer, mimeType);
      if (transcricao) avisos.push(`[transcrição do áudio enviado]: ${transcricao}`);
      else avisos.push("[usuário enviou um áudio, mas a transcrição não está disponível no momento]");

      anexosParaPersistir.push({
        tipo: "audio",
        mimeType,
        nomeArquivo: message.audio?.file_name,
        caminhoArmazenamento: caminho,
        tamanhoBytes,
        telegramFileId: voz.file_id,
        transcricao,
      });
    }

    const documento = message.document;
    if (documento) {
      const { buffer, mimeType, caminho, tamanhoBytes } = await baixarESalvar(documento.file_id, documento.file_size);
      if (mimeType === "application/pdf") {
        conteudoParaLlm.push({ type: "document", mimeType, data: buffer.toString("base64"), nome: documento.file_name });
      } else {
        avisos.push(`[usuário anexou um arquivo: ${documento.file_name ?? "sem nome"}]`);
      }

      anexosParaPersistir.push({
        tipo: "documento",
        mimeType,
        nomeArquivo: documento.file_name,
        caminhoArmazenamento: caminho,
        tamanhoBytes,
        telegramFileId: documento.file_id,
      });
    }
  } catch (err) {
    if (err instanceof ArquivoTelegramGrandeDemaisError) {
      avisos.push("[o arquivo enviado é grande demais e não pôde ser processado]");
    } else {
      throw err;
    }
  }

  return { textoAdicional: avisos.join("\n"), conteudoParaLlm, anexosParaPersistir };
}

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: TelegramUpdate }>("/webhook/telegram", async (request, reply) => {
    const telegramConfig = await getTelegramConfig();
    if (!telegramConfig) {
      logger.warn({ ip: request.ip }, "webhook do Telegram recebido sem bot configurado");
      return reply.code(503).send({ error: "bot nao configurado" });
    }

    if (telegramConfig.webhookSecret) {
      const secret = request.headers["x-telegram-bot-api-secret-token"];
      if (secret !== telegramConfig.webhookSecret) {
        logger.warn({ ip: request.ip }, "webhook do Telegram rejeitado - secret invalido");
        return reply.code(401).send({ error: "unauthorized" });
      }
    }

    const update = request.body;
    const message = update.message;

    const temConteudo = Boolean(
      message?.text || message?.caption || message?.photo || message?.voice || message?.audio || message?.document,
    );

    // Responder 200 sempre e rapido, mesmo para updates que nao processamos
    // (ex.: edicao de mensagem, membro entrando no grupo) - o Telegram
    // reenvia updates que nao sao confirmados.
    if (!message || !temConteudo) {
      return reply.code(200).send({ ok: true });
    }

    const usuario = await obterOuCriarUsuario(message.chat.id);

    if (message.text && COMANDOS_NOVA_CONVERSA.includes(message.text.trim())) {
      await iniciarNovaConversa(usuario.id);
      logger.info({ usuarioId: usuario.id }, "nova conversa iniciada via comando");
      await sendTelegramMessage(message.chat.id, "Prontinho, começamos uma conversa nova! O que você precisa?");
      return reply.code(200).send({ ok: true });
    }

    logger.info({ usuarioId: usuario.id, texto: message.text }, "mensagem recebida");

    try {
      const conversa = await obterOuCriarConversaAtiva(usuario.id);
      const { textoAdicional, conteudoParaLlm, anexosParaPersistir } = await processarAnexos(message);

      const texto = [message.text ?? message.caption ?? "", textoAdicional].filter(Boolean).join("\n");
      const turno: TurnoUsuario = { texto, conteudoParaLlm, anexosParaPersistir };

      const resposta = await processarMensagem(conversa.id, usuario.id, turno);
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
