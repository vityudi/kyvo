import { pool } from "./pool.js";

export type TipoPendencia = "lembrete" | "tarefa";
export type StatusPendencia = "pendente" | "concluido" | "cancelado";
export type Recorrencia = "diaria" | "semanal" | "mensal" | "anual";

export interface Pendencia {
  id: string;
  tipo: TipoPendencia;
  descricao: string;
  data_hora: string | null;
  recorrencia: Recorrencia | null;
  status: StatusPendencia;
}

interface CriarLembreteInput {
  descricao: string;
  data_hora: string; // instante UTC ja resolvido pela camada de tools
  recorrencia?: Recorrencia;
}

interface CriarTarefaInput {
  descricao: string;
  data_hora?: string; // instante UTC ja resolvido pela camada de tools, se informado
}

interface ListarPendenciasInput {
  tipo?: TipoPendencia;
  status?: StatusPendencia;
  limite?: number;
}

interface LembreteDisparado {
  id: string;
  descricao: string;
  telegram_chat_id: number;
}

function mapPendencia(row: {
  id: string;
  tipo: string;
  descricao: string;
  data_hora: string | null;
  recorrencia: string | null;
  status: string;
}): Pendencia {
  return {
    id: row.id,
    tipo: row.tipo as TipoPendencia,
    descricao: row.descricao,
    data_hora: row.data_hora,
    recorrencia: row.recorrencia as Recorrencia | null,
    status: row.status as StatusPendencia,
  };
}

export async function criarLembrete(usuarioId: string, input: CriarLembreteInput): Promise<Pendencia> {
  const { rows } = await pool.query(
    `insert into lembrete (usuario_id, tipo, descricao, data_hora, recorrencia)
     values ($1, 'lembrete', $2, $3::timestamptz, $4)
     returning id, tipo, descricao, data_hora, recorrencia, status`,
    [usuarioId, input.descricao, input.data_hora, input.recorrencia ?? null],
  );

  const lembrete = rows[0];
  if (!lembrete) {
    throw new Error("falha ao criar lembrete - insert nao retornou linha");
  }
  return mapPendencia(lembrete);
}

export async function criarTarefa(usuarioId: string, input: CriarTarefaInput): Promise<Pendencia> {
  const { rows } = await pool.query(
    `insert into lembrete (usuario_id, tipo, descricao, data_hora)
     values ($1, 'tarefa', $2, $3::timestamptz)
     returning id, tipo, descricao, data_hora, recorrencia, status`,
    [usuarioId, input.descricao, input.data_hora ?? null],
  );

  const tarefa = rows[0];
  if (!tarefa) {
    throw new Error("falha ao criar tarefa - insert nao retornou linha");
  }
  return mapPendencia(tarefa);
}

export async function listarPendencias(usuarioId: string, input: ListarPendenciasInput = {}): Promise<Pendencia[]> {
  const status = input.status ?? "pendente";
  const limite = input.limite ?? 20;

  const { rows } = await pool.query(
    `select id, tipo, descricao, data_hora, recorrencia, status
       from lembrete
      where usuario_id = $1
        and status = $2
        and ($3::text is null or tipo = $3)
      order by data_hora asc nulls last, criado_em asc
      limit $4`,
    [usuarioId, status, input.tipo ?? null, limite],
  );

  return rows.map(mapPendencia);
}

export async function concluirTarefa(usuarioId: string, id: string): Promise<Pendencia> {
  const { rows } = await pool.query(
    `update lembrete
        set status = 'concluido', concluido_em = now(), atualizado_em = now()
      where id = $1 and usuario_id = $2 and tipo = 'tarefa' and status = 'pendente'
      returning id, tipo, descricao, data_hora, recorrencia, status`,
    [id, usuarioId],
  );

  const tarefa = rows[0];
  if (!tarefa) {
    throw new Error("tarefa nao encontrada, ja concluida/cancelada, ou nao pertence a este usuario");
  }
  return mapPendencia(tarefa);
}

export async function cancelarPendencia(usuarioId: string, id: string): Promise<Pendencia> {
  const { rows } = await pool.query(
    `update lembrete
        set status = 'cancelado', atualizado_em = now()
      where id = $1 and usuario_id = $2 and status = 'pendente'
      returning id, tipo, descricao, data_hora, recorrencia, status`,
    [id, usuarioId],
  );

  const pendencia = rows[0];
  if (!pendencia) {
    throw new Error("lembrete/tarefa nao encontrado, ja concluido/cancelado, ou nao pertence a este usuario");
  }
  return mapPendencia(pendencia);
}

/**
 * Usada pelo worker: marca atomicamente todos os lembretes vencidos como
 * disparados. Para lembretes pontuais (recorrencia null), status vira
 * 'concluido' e nao dispara mais. Para lembretes recorrentes, data_hora
 * avanca pelo intervalo e o status continua 'pendente', para disparar de
 * novo na proxima ocorrencia. A propria atualizacao (WHERE status='pendente')
 * e a trava contra double-send se o worker reiniciar no meio do minuto - uma
 * segunda passada nao encontra mais essas linhas com status='pendente'.
 * Nunca toca tarefas (filtro tipo = 'lembrete').
 */
export async function dispararLembretesVencidos(): Promise<LembreteDisparado[]> {
  const { rows } = await pool.query(
    `update lembrete l
        set data_hora = case l.recorrencia
              when 'diaria'  then l.data_hora + interval '1 day'
              when 'semanal' then l.data_hora + interval '7 days'
              when 'mensal'  then l.data_hora + interval '1 month'
              when 'anual'   then l.data_hora + interval '1 year'
              else l.data_hora
            end,
            status = case when l.recorrencia is null then 'concluido' else 'pendente' end,
            concluido_em = case when l.recorrencia is null then now() else l.concluido_em end,
            atualizado_em = now()
       from usuario u
      where l.tipo = 'lembrete'
        and l.status = 'pendente'
        and l.data_hora <= now()
        and u.id = l.usuario_id
      returning l.id, l.descricao, u.telegram_chat_id`,
  );

  return rows;
}
