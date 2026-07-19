import { pool } from "./pool.js";

export type StatusItemTarefa = "pendente" | "concluido";

export interface ItemTarefa {
  id: string;
  tarefa_id: string;
  descricao: string;
  status: StatusItemTarefa;
}

function mapItemTarefa(row: { id: string; tarefa_id: string; descricao: string; status: string }): ItemTarefa {
  return {
    id: row.id,
    tarefa_id: row.tarefa_id,
    descricao: row.descricao,
    status: row.status as StatusItemTarefa,
  };
}

/**
 * Insere um item vinculado a uma tarefa existente do proprio usuario. O
 * `select ... from lembrete` no lugar de um `values` fixo garante ownership e
 * tipo='tarefa' atomicamente - se a tarefa nao existir, for de outro usuario,
 * ou for um lembrete (nao tarefa), a query nao retorna linha nenhuma.
 */
export async function adicionarItemTarefa(usuarioId: string, tarefaId: string, descricao: string): Promise<ItemTarefa> {
  const { rows } = await pool.query(
    `insert into tarefa_item (tarefa_id, descricao)
     select l.id, $3
       from lembrete l
      where l.id = $2 and l.usuario_id = $1 and l.tipo = 'tarefa'
     returning id, tarefa_id, descricao, status`,
    [usuarioId, tarefaId, descricao],
  );

  const item = rows[0];
  if (!item) {
    throw new Error("tarefa nao encontrada, nao e uma lista de itens, ou nao pertence a este usuario");
  }
  return mapItemTarefa(item);
}

export async function removerItemTarefa(usuarioId: string, itemId: string): Promise<ItemTarefa> {
  const { rows } = await pool.query(
    `delete from tarefa_item ti
      using lembrete l
      where ti.id = $2 and ti.tarefa_id = l.id and l.usuario_id = $1
     returning ti.id, ti.tarefa_id, ti.descricao, ti.status`,
    [usuarioId, itemId],
  );

  const item = rows[0];
  if (!item) {
    throw new Error("item nao encontrado ou nao pertence a este usuario");
  }
  return mapItemTarefa(item);
}

export async function marcarItemTarefa(usuarioId: string, itemId: string, concluido: boolean): Promise<ItemTarefa> {
  const status: StatusItemTarefa = concluido ? "concluido" : "pendente";

  const { rows } = await pool.query(
    `update tarefa_item ti
        set status = $3, concluido_em = case when $3 = 'concluido' then now() else null end
       from lembrete l
      where ti.id = $2 and ti.tarefa_id = l.id and l.usuario_id = $1
     returning ti.id, ti.tarefa_id, ti.descricao, ti.status`,
    [usuarioId, itemId, status],
  );

  const item = rows[0];
  if (!item) {
    throw new Error("item nao encontrado ou nao pertence a este usuario");
  }
  return mapItemTarefa(item);
}

export async function listarItensTarefa(usuarioId: string, tarefaId: string): Promise<ItemTarefa[]> {
  const { rows } = await pool.query(
    `select ti.id, ti.tarefa_id, ti.descricao, ti.status
       from tarefa_item ti
       join lembrete l on l.id = ti.tarefa_id
      where l.id = $2 and l.usuario_id = $1
      order by ti.criado_em asc`,
    [usuarioId, tarefaId],
  );

  return rows.map(mapItemTarefa);
}
