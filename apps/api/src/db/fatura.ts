import type { PoolClient } from "pg";
import { resolverDataHoraLocalSp, agoraSp } from "../lib/tempo.js";
import { pool } from "./pool.js";

export type StatusFatura = "aberta" | "fechada" | "paga";

export interface Fatura {
  id: string;
  cartao_id: string;
  data_fechamento: string;
  data_vencimento: string;
  status: StatusFatura;
  valor: number;
  transacao_pagamento_id: string | null;
}

interface ListarFaturasInput {
  cartao_id?: string;
  status?: StatusFatura;
  limite?: number;
}

const SELECT_CAMPOS_BASE =
  "f.id, f.cartao_id, to_char(f.data_fechamento, 'YYYY-MM-DD') as data_fechamento, to_char(f.data_vencimento, 'YYYY-MM-DD') as data_vencimento, f.status, f.transacao_pagamento_id";

function dataDoMes(ano: number, mes0: number, dia: number): Date {
  const ultimoDia = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(dia, ultimoDia));
}

function formatarIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Resolve as datas de fechamento/vencimento do ciclo de fatura corrente a
 * partir dos dias cadastrados no cartao. O fechamento corrente e o proximo
 * dia_fechamento a partir de hoje (deste mes se ainda nao passou, do mes
 * seguinte se ja passou). O vencimento cai no mesmo mes do fechamento
 * quando dia_vencimento >= dia_fechamento (ex.: fecha dia 5, vence dia 15),
 * ou no mes seguinte quando dia_vencimento < dia_fechamento (ex.: fecha dia
 * 25, vence dia 5) - padrao real de cartao de credito brasileiro.
 */
export function calcularCicloFatura(
  diaFechamento: number,
  diaVencimento: number,
  referenciaIso?: string,
): { data_fechamento: string; data_vencimento: string } {
  const hoje = new Date(`${referenciaIso ?? agoraSp().data}T00:00:00`);
  const ano = hoje.getFullYear();
  const mes0 = hoje.getMonth();

  const fechamentoEsteMes = dataDoMes(ano, mes0, diaFechamento);
  const fechamento = hoje.getTime() <= fechamentoEsteMes.getTime() ? fechamentoEsteMes : dataDoMes(ano, mes0 + 1, diaFechamento);

  const mesVencimento0 = fechamento.getMonth() + (diaVencimento < diaFechamento ? 1 : 0);
  const vencimento = dataDoMes(fechamento.getFullYear(), mesVencimento0, diaVencimento);

  return { data_fechamento: formatarIso(fechamento), data_vencimento: formatarIso(vencimento) };
}

/** Soma sempre em query (nunca desnormalizado) - mesmo padrao de resumoPeriodo/consultarSaldo em db/transacao.ts. */
export async function valorFatura(faturaId: string, client: PoolClient | typeof pool = pool): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `select coalesce(sum(valor), 0) as total from transacao where fatura_id = $1`,
    [faturaId],
  );
  return Number(rows[0]?.total ?? 0);
}

function mapRow(row: {
  id: string;
  cartao_id: string;
  data_fechamento: string;
  data_vencimento: string;
  status: string;
  transacao_pagamento_id: string | null;
  valor: string;
}): Fatura {
  return {
    id: row.id,
    cartao_id: row.cartao_id,
    data_fechamento: row.data_fechamento,
    data_vencimento: row.data_vencimento,
    status: row.status as StatusFatura,
    transacao_pagamento_id: row.transacao_pagamento_id,
    valor: Number(row.valor),
  };
}

/**
 * Garante que existe uma fatura 'aberta' para o cartao e devolve o id dela
 * (criando-a, com o lancamento_futuro pareado e o lembrete de vencimento,
 * se for a primeira compra do ciclo). Idempotente: se a fatura 'aberta'
 * encontrada ja passou do fechamento, fecha ela e cria a proxima. Sempre
 * chamada dentro da transacao de banco de registrarDespesa (db/transacao.ts)
 * - por isso exige um client explicito, nunca abre a propria transacao.
 */
export async function obterOuCriarFaturaAberta(usuarioId: string, cartaoId: string, client: PoolClient): Promise<string> {
  const { rows: cartaoRows } = await client.query<{ conta_id: string; nome: string; dia_fechamento: number; dia_vencimento: number }>(
    `select conta_id, nome, dia_fechamento, dia_vencimento from cartao where id = $1 and usuario_id = $2 and ativo = true`,
    [cartaoId, usuarioId],
  );
  const cartao = cartaoRows[0];
  if (!cartao) {
    throw new Error("cartao nao encontrado, inativo, ou nao pertence a este usuario");
  }

  const hoje = agoraSp().data;
  const { rows: abertaRows } = await client.query<{ id: string; data_fechamento: string }>(
    `select id, to_char(data_fechamento, 'YYYY-MM-DD') as data_fechamento
       from fatura
      where cartao_id = $1 and status = 'aberta'`,
    [cartaoId],
  );
  const aberta = abertaRows[0];

  if (aberta) {
    if (aberta.data_fechamento >= hoje) {
      return aberta.id;
    }
    await client.query(`update fatura set status = 'fechada', atualizado_em = now() where id = $1`, [aberta.id]);
  }

  const ciclo = calcularCicloFatura(cartao.dia_fechamento, cartao.dia_vencimento, hoje);

  const { rows: novaFaturaRows } = await client.query<{ id: string }>(
    `insert into fatura (usuario_id, cartao_id, data_fechamento, data_vencimento)
     values ($1, $2, $3::date, $4::date)
     returning id`,
    [usuarioId, cartaoId, ciclo.data_fechamento, ciclo.data_vencimento],
  );
  const novaFaturaId = novaFaturaRows[0]?.id;
  if (!novaFaturaId) {
    throw new Error("falha ao criar fatura - insert nao retornou linha");
  }

  // Insere o lembrete via `client` (nao pelo helper criarLembrete, que usa o
  // `pool` direto) para ficar na mesma transacao da fatura/lancamento_futuro
  // - senao um rollback do insert da transacao (ver registrarDespesa) deixaria
  // um lembrete orfao, ja commitado numa conexao separada.
  const { rows: lembreteRows } = await client.query<{ id: string }>(
    `insert into lembrete (usuario_id, tipo, descricao, data_hora)
     values ($1, 'lembrete', $2, $3::timestamptz)
     returning id`,
    [usuarioId, `Fatura do cartão ${cartao.nome} vence`, resolverDataHoraLocalSp(`${ciclo.data_vencimento}T09:00`)],
  );
  const lembreteId = lembreteRows[0]?.id;

  await client.query(
    `insert into lancamento_futuro
        (usuario_id, conta_id, tipo, valor, categoria, descricao, data_prevista, lembrete_id, fatura_id)
     values ($1, $2, 'despesa', 0, 'fatura de cartão', $3, $4::date, $5, $6)`,
    [usuarioId, cartao.conta_id, `Fatura ${cartao.nome}`, ciclo.data_vencimento, lembreteId, novaFaturaId],
  );

  return novaFaturaId;
}

/** Vencimento relativo a um fechamento ja conhecido (nao calculado a partir de "hoje" como em calcularCicloFatura) - mesmo mes se dia_vencimento >= dia do fechamento, mes seguinte senao. */
function vencimentoParaFechamento(diaVencimento: number, dataFechamentoIso: string): string {
  const fechamento = new Date(`${dataFechamentoIso}T00:00:00`);
  const mesVencimento0 = fechamento.getMonth() + (diaVencimento < fechamento.getDate() ? 1 : 0);
  return formatarIso(dataDoMes(fechamento.getFullYear(), mesVencimento0, diaVencimento));
}

/**
 * Resolve (ou cria) a fatura cujo fechamento e EXATAMENTE `dataFechamento`,
 * informada explicitamente (nunca calculada a partir do dia_fechamento
 * cadastrado no cartao) - usado por importarExtratoBancario
 * (db/extratoImportacao.ts) pra importar uma fatura antiga (OFX/CSV) inteira
 * como uma unica fatura. Calcular o ciclo a partir de dia_fechamento seria
 * fragil pra extratos historicos: esse dia pode ter mudado desde entao (o
 * cartao real pode ter fechado num dia diferente naquela epoca), e de
 * qualquer forma um arquivo de fatura exportado pelo banco ja e, por
 * construcao, os lancamentos de uma unica fatura - nao ha nada pra
 * "recalcular". Se a data informada bater com o ciclo aberto atual,
 * reaproveita obterOuCriarFaturaAberta (idempotencia/lembrete); senao cria
 * como 'fechada' direto, sem lembrete/lancamento_futuro pareado (que so faz
 * sentido pra vencimento futuro).
 */
export async function obterOuCriarFaturaPorFechamentoExplicito(
  usuarioId: string,
  cartaoId: string,
  dataFechamento: string,
  client: PoolClient,
): Promise<string> {
  const { rows: existenteRows } = await client.query<{ id: string }>(
    `select id from fatura where cartao_id = $1 and data_fechamento = $2::date`,
    [cartaoId, dataFechamento],
  );
  if (existenteRows[0]) {
    return existenteRows[0].id;
  }

  const hoje = agoraSp().data;
  if (dataFechamento >= hoje) {
    return obterOuCriarFaturaAberta(usuarioId, cartaoId, client);
  }

  const { rows: cartaoRows } = await client.query<{ dia_vencimento: number }>(
    `select dia_vencimento from cartao where id = $1 and usuario_id = $2 and ativo = true`,
    [cartaoId, usuarioId],
  );
  const cartao = cartaoRows[0];
  if (!cartao) {
    throw new Error("cartao nao encontrado, inativo, ou nao pertence a este usuario");
  }
  const dataVencimento = vencimentoParaFechamento(cartao.dia_vencimento, dataFechamento);

  const { rows: novaFaturaRows } = await client.query<{ id: string }>(
    `insert into fatura (usuario_id, cartao_id, data_fechamento, data_vencimento, status)
     values ($1, $2, $3::date, $4::date, 'fechada')
     returning id`,
    [usuarioId, cartaoId, dataFechamento, dataVencimento],
  );
  const novaFaturaId = novaFaturaRows[0]?.id;
  if (!novaFaturaId) {
    throw new Error("falha ao criar fatura - insert nao retornou linha");
  }
  return novaFaturaId;
}

export async function listarFaturas(usuarioId: string, input: ListarFaturasInput = {}): Promise<Fatura[]> {
  const limite = input.limite ?? 50;
  const { rows } = await pool.query(
    `select ${SELECT_CAMPOS_BASE}, coalesce((select sum(t.valor) from transacao t where t.fatura_id = f.id), 0) as valor
       from fatura f
      where f.usuario_id = $1
        and ($2::uuid is null or f.cartao_id = $2)
        and ($3::text is null or f.status = $3)
      order by f.data_vencimento desc
      limit $4`,
    [usuarioId, input.cartao_id ?? null, input.status ?? null, limite],
  );
  return rows.map(mapRow);
}

export interface TransacaoFatura {
  id: string;
  valor: number;
  categoria: string;
  descricao: string | null;
  data: string;
  data_hora: string;
}

/** Lista as compras individuais que compoem o total de uma fatura (ver VALOR_CAMPO_CALCULADO em db/lancamentoFuturo.ts) - usado pelo painel para "ver fatura" a partir do lancamento futuro pareado. */
export async function transacoesDaFatura(usuarioId: string, faturaId: string): Promise<TransacaoFatura[]> {
  const { rows } = await pool.query<TransacaoFatura>(
    `select id, valor, categoria, descricao, data, data_hora
       from transacao
      where usuario_id = $1 and fatura_id = $2
      order by data_hora desc`,
    [usuarioId, faturaId],
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

/**
 * Acha o lancamento_futuro pareado de uma fatura (ver alter table
 * lancamento_futuro add column fatura_id em 0010_contas_cartoes_faturas.sql).
 * Usado por pagar_fatura (tools.ts) para traduzir "pagar a fatura X" na
 * chamada de confirmarLancamentoFuturo (db/lancamentoFuturo.ts) sem o
 * usuario/agente precisar saber o lancamento_id - so consulta simples, sem
 * importar lancamentoFuturo.ts aqui (evitaria ciclo, ja que ele importa
 * transacao.ts, que importa este arquivo).
 */
export async function lancamentoFuturoIdDaFatura(usuarioId: string, faturaId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from lancamento_futuro where usuario_id = $1 and fatura_id = $2`,
    [usuarioId, faturaId],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("fatura nao encontrada, nao pertence a este usuario, ou ja foi paga (sem lancamento futuro pendente vinculado)");
  }
  return id;
}

/** Marca faturas 'aberta' vencidas como 'fechada' - reforco diario (scheduler) do que obterOuCriarFaturaAberta ja faz sob demanda, para ciclos sem nenhuma compra apos o fechamento. */
export async function fecharFaturasVencidas(): Promise<number> {
  const { rowCount } = await pool.query(
    `update fatura
        set status = 'fechada', atualizado_em = now()
      where status = 'aberta' and data_fechamento < current_date`,
  );
  return rowCount ?? 0;
}
