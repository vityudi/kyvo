import { pool } from "./pool.js";

export interface Meta {
  id: string;
  nome: string;
  valor_alvo: number;
  valor_atual: number;
  prazo: string | null;
  status: "ativa" | "concluida" | "cancelada";
}

interface CriarMetaInput {
  nome: string;
  valor_alvo: number;
  prazo?: string;
  valor_inicial?: number;
}

interface AtualizarMetaInput {
  meta_id: string;
  valor_aportado?: number;
  status?: "ativa" | "concluida" | "cancelada";
}

function mapMeta(row: {
  id: string;
  nome: string;
  valor_alvo: string;
  valor_atual: string;
  prazo: string | null;
  status: string;
}): Meta {
  return {
    id: row.id,
    nome: row.nome,
    valor_alvo: Number(row.valor_alvo),
    valor_atual: Number(row.valor_atual),
    prazo: row.prazo,
    status: row.status as Meta["status"],
  };
}

export async function criarMeta(usuarioId: string, input: CriarMetaInput): Promise<Meta> {
  const { rows } = await pool.query(
    `insert into meta (usuario_id, nome, valor_alvo, valor_atual, prazo)
     values ($1, $2, $3, $4, $5::date)
     returning id, nome, valor_alvo, valor_atual, prazo, status`,
    [usuarioId, input.nome, input.valor_alvo, input.valor_inicial ?? 0, input.prazo ?? null],
  );

  const meta = rows[0];
  if (!meta) {
    throw new Error("falha ao criar meta - insert nao retornou linha");
  }
  return mapMeta(meta);
}

export async function atualizarMeta(usuarioId: string, input: AtualizarMetaInput): Promise<Meta> {
  const { rows: existentes } = await pool.query(
    "select id from meta where id = $1 and usuario_id = $2",
    [input.meta_id, usuarioId],
  );
  if (!existentes[0]) {
    throw new Error("meta nao encontrada ou nao pertence a este usuario");
  }

  const { rows } = await pool.query(
    `update meta
        set valor_atual   = valor_atual + coalesce($3, 0),
            status        = coalesce($4, status),
            atualizado_em = now()
      where id = $1 and usuario_id = $2
      returning id, nome, valor_alvo, valor_atual, prazo, status`,
    [input.meta_id, usuarioId, input.valor_aportado ?? null, input.status ?? null],
  );

  const meta = rows[0];
  if (!meta) {
    throw new Error("falha ao atualizar meta - update nao retornou linha");
  }
  return mapMeta(meta);
}

export async function listarMetasAtivas(usuarioId: string): Promise<Meta[]> {
  const { rows } = await pool.query(
    "select id, nome, valor_alvo, valor_atual, prazo, status from meta where usuario_id = $1 and status = 'ativa' order by criado_em",
    [usuarioId],
  );
  return rows.map(mapMeta);
}
