import { pool } from "./pool.js";

export type TipoAnexo = "imagem" | "audio" | "documento";

export interface NovoAnexo {
  mensagemId: string;
  tipo: TipoAnexo;
  mimeType: string;
  nomeArquivo?: string | null;
  caminhoArmazenamento: string;
  tamanhoBytes?: number | null;
  telegramFileId?: string | null;
  transcricao?: string | null;
}

export interface Anexo {
  id: string;
  mensagemId: string;
  tipo: TipoAnexo;
  mimeType: string;
  nomeArquivo: string | null;
  tamanhoBytes: number | null;
  transcricao: string | null;
}

export async function criarAnexo(dados: NovoAnexo): Promise<Anexo> {
  const { rows } = await pool.query<{
    id: string;
    mensagem_id: string;
    tipo: TipoAnexo;
    mime_type: string;
    nome_arquivo: string | null;
    tamanho_bytes: number | null;
    transcricao: string | null;
  }>(
    `insert into anexo (mensagem_id, tipo, mime_type, nome_arquivo, caminho_armazenamento, tamanho_bytes, telegram_file_id, transcricao)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, mensagem_id, tipo, mime_type, nome_arquivo, tamanho_bytes, transcricao`,
    [
      dados.mensagemId,
      dados.tipo,
      dados.mimeType,
      dados.nomeArquivo ?? null,
      dados.caminhoArmazenamento,
      dados.tamanhoBytes ?? null,
      dados.telegramFileId ?? null,
      dados.transcricao ?? null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("falha ao criar anexo - insert nao retornou linha");

  return {
    id: row.id,
    mensagemId: row.mensagem_id,
    tipo: row.tipo,
    mimeType: row.mime_type,
    nomeArquivo: row.nome_arquivo,
    tamanhoBytes: row.tamanho_bytes,
    transcricao: row.transcricao,
  };
}

/** Batched - evita N+1 ao montar a lista paginada de mensagens do admin. */
export async function listarAnexosPorMensagens(mensagemIds: string[]): Promise<Map<string, Anexo[]>> {
  const mapa = new Map<string, Anexo[]>();
  if (mensagemIds.length === 0) return mapa;

  const { rows } = await pool.query<{
    id: string;
    mensagem_id: string;
    tipo: TipoAnexo;
    mime_type: string;
    nome_arquivo: string | null;
    tamanho_bytes: number | null;
    transcricao: string | null;
  }>(
    `select id, mensagem_id, tipo, mime_type, nome_arquivo, tamanho_bytes, transcricao
       from anexo
      where mensagem_id = any($1)
      order by criado_em`,
    [mensagemIds],
  );

  for (const row of rows) {
    const anexo: Anexo = {
      id: row.id,
      mensagemId: row.mensagem_id,
      tipo: row.tipo,
      mimeType: row.mime_type,
      nomeArquivo: row.nome_arquivo,
      tamanhoBytes: row.tamanho_bytes,
      transcricao: row.transcricao,
    };
    const lista = mapa.get(row.mensagem_id);
    if (lista) lista.push(anexo);
    else mapa.set(row.mensagem_id, [anexo]);
  }

  return mapa;
}

/** Usado pela rota de download (`/web/api/anexos/:id`) para resolver o arquivo em disco. */
export async function obterAnexoParaDownload(
  anexoId: string,
): Promise<{ caminhoArmazenamento: string; mimeType: string; nomeArquivo: string | null } | null> {
  const { rows } = await pool.query<{ caminho_armazenamento: string; mime_type: string; nome_arquivo: string | null }>(
    "select caminho_armazenamento, mime_type, nome_arquivo from anexo where id = $1",
    [anexoId],
  );
  const row = rows[0];
  if (!row) return null;
  return { caminhoArmazenamento: row.caminho_armazenamento, mimeType: row.mime_type, nomeArquivo: row.nome_arquivo };
}
