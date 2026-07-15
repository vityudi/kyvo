import { logger } from "../lib/logger.js";
import { categoriaValida, contaPadrao } from "./categoria.js";
import { pool } from "./pool.js";

export interface Transacao {
  id: string;
  tipo: "despesa" | "receita";
  valor: number;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data: string;
}

interface RegistrarDespesaInput {
  valor: number;
  categoria: string;
  descricao: string;
  data?: string;
  conta_id?: string;
  confianca?: "alta" | "media" | "baixa";
}

interface RegistrarReceitaInput {
  valor: number;
  fonte: string;
  descricao?: string;
  data?: string;
  conta_id?: string;
  confianca?: "alta" | "media" | "baixa";
}

interface EditarTransacaoInput {
  transacao_id: string;
  valor?: number;
  categoria?: string;
  descricao?: string;
  data?: string;
}

interface ConsultarTransacoesInput {
  data_inicio: string;
  data_fim: string;
  tipo?: "despesa" | "receita" | "todos";
  categoria?: string;
  conta_id?: string;
  limite?: number;
}

interface ResumoPeriodoInput {
  data_inicio: string;
  data_fim: string;
  agrupar_por?: "categoria" | "conta" | "nenhum";
  comparar_periodo_anterior?: boolean;
}

interface ConsultarSaldoInput {
  data_inicio?: string;
  conta_id?: string;
}

async function totalCategoriaNoMes(usuarioId: string, categoria: string, data: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select coalesce(sum(valor), 0) as total
       from transacao
      where usuario_id = $1
        and tipo = 'despesa'
        and lower(categoria) = lower($2)
        and date_trunc('month', data) = date_trunc('month', $3::date)`,
    [usuarioId, categoria, data],
  );
  return Number(rows[0]?.total ?? 0);
}

async function totalReceitasNoMes(usuarioId: string, data: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select coalesce(sum(valor), 0) as total
       from transacao
      where usuario_id = $1
        and tipo = 'receita'
        and date_trunc('month', data) = date_trunc('month', $2::date)`,
    [usuarioId, data],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function registrarDespesa(
  usuarioId: string,
  input: RegistrarDespesaInput,
): Promise<{ transacao_id: string; valor: number; categoria: string; data: string; saldo_categoria_mes: number }> {
  if (!(await categoriaValida(usuarioId, input.categoria, "despesa"))) {
    throw new Error(
      `categoria "${input.categoria}" nao reconhecida para despesas. Use uma categoria conhecida do usuario ou "outros".`,
    );
  }

  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));

  const { rows } = await pool.query<{ id: string; valor: string; categoria: string; data: string }>(
    `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, descricao, data, confianca)
     values ($1, $2, 'despesa', $3, $4, $5, coalesce($6::date, current_date), $7)
     returning id, valor, categoria, data`,
    [usuarioId, contaId, input.valor, input.categoria, input.descricao, input.data ?? null, input.confianca ?? null],
  );

  const criada = rows[0];
  if (!criada) {
    throw new Error("falha ao registrar despesa - insert nao retornou linha");
  }

  const saldoCategoriaMes = await totalCategoriaNoMes(usuarioId, criada.categoria, criada.data);

  return {
    transacao_id: criada.id,
    valor: Number(criada.valor),
    categoria: criada.categoria,
    data: criada.data,
    saldo_categoria_mes: saldoCategoriaMes,
  };
}

export async function registrarReceita(
  usuarioId: string,
  input: RegistrarReceitaInput,
): Promise<{ transacao_id: string; valor: number; fonte: string; data: string; total_receitas_mes: number }> {
  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));

  // categoria e denormalizada como texto livre (ver schema) - para receita
  // reaproveitamos a propria "fonte" como categoria, ja que a tool
  // registrar_receita nao expoe um campo categoria separado.
  const { rows } = await pool.query<{ id: string; valor: string; fonte: string; data: string }>(
    `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, fonte, descricao, data, confianca)
     values ($1, $2, 'receita', $3, $4, $4, $5, coalesce($6::date, current_date), $7)
     returning id, valor, fonte, data`,
    [usuarioId, contaId, input.valor, input.fonte, input.descricao ?? null, input.data ?? null, input.confianca ?? null],
  );

  const criada = rows[0];
  if (!criada) {
    throw new Error("falha ao registrar receita - insert nao retornou linha");
  }

  const totalReceitasMes = await totalReceitasNoMes(usuarioId, criada.data);

  return {
    transacao_id: criada.id,
    valor: Number(criada.valor),
    fonte: criada.fonte,
    data: criada.data,
    total_receitas_mes: totalReceitasMes,
  };
}

async function buscarTransacao(usuarioId: string, transacaoId: string): Promise<Transacao> {
  const { rows } = await pool.query<Transacao>(
    "select id, tipo, valor, categoria, descricao, fonte, data from transacao where id = $1 and usuario_id = $2",
    [transacaoId, usuarioId],
  );
  const transacao = rows[0];
  if (!transacao) {
    throw new Error("transacao nao encontrada ou nao pertence a este usuario");
  }
  return transacao;
}

export async function editarTransacao(usuarioId: string, input: EditarTransacaoInput): Promise<Transacao> {
  const atual = await buscarTransacao(usuarioId, input.transacao_id);

  if (input.categoria && !(await categoriaValida(usuarioId, input.categoria, atual.tipo))) {
    throw new Error(`categoria "${input.categoria}" nao reconhecida para ${atual.tipo}s.`);
  }

  const { rows } = await pool.query<Transacao>(
    `update transacao
        set valor         = coalesce($3, valor),
            categoria     = coalesce($4, categoria),
            descricao     = coalesce($5, descricao),
            data          = coalesce($6::date, data),
            atualizado_em = now()
      where id = $1 and usuario_id = $2
      returning id, tipo, valor, categoria, descricao, fonte, data`,
    [
      input.transacao_id,
      usuarioId,
      input.valor ?? null,
      input.categoria ?? null,
      input.descricao ?? null,
      input.data ?? null,
    ],
  );

  const atualizada = rows[0];
  if (!atualizada) {
    throw new Error("falha ao editar transacao - update nao retornou linha");
  }
  return atualizada;
}

export async function excluirTransacao(
  usuarioId: string,
  transacaoId: string,
  motivo?: string,
): Promise<{ transacao_id: string; ok: true }> {
  await buscarTransacao(usuarioId, transacaoId);

  await pool.query("delete from transacao where id = $1 and usuario_id = $2", [transacaoId, usuarioId]);
  logger.info({ usuarioId, transacaoId, motivo }, "transacao excluida");

  return { transacao_id: transacaoId, ok: true };
}

export async function consultarTransacoes(usuarioId: string, input: ConsultarTransacoesInput): Promise<Transacao[]> {
  const tipo = input.tipo ?? "todos";
  const limite = input.limite ?? 50;

  const { rows } = await pool.query<Transacao>(
    `select id, tipo, valor, categoria, descricao, fonte, data
       from transacao
      where usuario_id = $1
        and data between $2::date and $3::date
        and ($4::text = 'todos' or tipo = $4)
        and ($5::text is null or lower(categoria) = lower($5))
        and ($6::uuid is null or conta_id = $6)
      order by data desc, criado_em desc
      limit $7`,
    [usuarioId, input.data_inicio, input.data_fim, tipo, input.categoria ?? null, input.conta_id ?? null, limite],
  );

  return rows;
}

interface ResumoPeriodo {
  total_despesas: number;
  total_receitas: number;
  saldo: number;
  por_categoria?: { categoria: string; total: number }[];
  por_conta?: { conta_id: string; total: number }[];
  periodo_anterior?: { total_despesas: number; variacao_percentual: number | null };
}

async function totaisPeriodo(
  usuarioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ total_despesas: number; total_receitas: number }> {
  const { rows } = await pool.query<{ tipo: string; total: string }>(
    `select tipo, coalesce(sum(valor), 0) as total
       from transacao
      where usuario_id = $1 and data between $2::date and $3::date
      group by tipo`,
    [usuarioId, dataInicio, dataFim],
  );

  let totalDespesas = 0;
  let totalReceitas = 0;
  for (const row of rows) {
    if (row.tipo === "despesa") totalDespesas = Number(row.total);
    if (row.tipo === "receita") totalReceitas = Number(row.total);
  }
  return { total_despesas: totalDespesas, total_receitas: totalReceitas };
}

export async function resumoPeriodo(usuarioId: string, input: ResumoPeriodoInput): Promise<ResumoPeriodo> {
  const agruparPor = input.agrupar_por ?? "categoria";
  const compararPeriodoAnterior = input.comparar_periodo_anterior ?? true;

  const { total_despesas, total_receitas } = await totaisPeriodo(usuarioId, input.data_inicio, input.data_fim);

  const resumo: ResumoPeriodo = {
    total_despesas,
    total_receitas,
    saldo: total_receitas - total_despesas,
  };

  if (agruparPor === "categoria") {
    const { rows } = await pool.query<{ categoria: string; total: string }>(
      `select categoria, coalesce(sum(valor), 0) as total
         from transacao
        where usuario_id = $1 and data between $2::date and $3::date and tipo = 'despesa'
        group by categoria
        order by total desc`,
      [usuarioId, input.data_inicio, input.data_fim],
    );
    resumo.por_categoria = rows.map((r) => ({ categoria: r.categoria, total: Number(r.total) }));
  } else if (agruparPor === "conta") {
    const { rows } = await pool.query<{ conta_id: string; total: string }>(
      `select conta_id, coalesce(sum(valor), 0) as total
         from transacao
        where usuario_id = $1 and data between $2::date and $3::date
        group by conta_id
        order by total desc`,
      [usuarioId, input.data_inicio, input.data_fim],
    );
    resumo.por_conta = rows.map((r) => ({ conta_id: r.conta_id, total: Number(r.total) }));
  }

  if (compararPeriodoAnterior) {
    const duracaoDias = Math.round(
      (new Date(input.data_fim).getTime() - new Date(input.data_inicio).getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    const fimAnterior = new Date(input.data_inicio);
    fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior);
    inicioAnterior.setDate(inicioAnterior.getDate() - (duracaoDias - 1));

    const anterior = await totaisPeriodo(
      usuarioId,
      inicioAnterior.toISOString().slice(0, 10),
      fimAnterior.toISOString().slice(0, 10),
    );

    const variacaoPercentual =
      anterior.total_despesas > 0
        ? ((total_despesas - anterior.total_despesas) / anterior.total_despesas) * 100
        : null;

    resumo.periodo_anterior = {
      total_despesas: anterior.total_despesas,
      variacao_percentual: variacaoPercentual,
    };
  }

  return resumo;
}

export async function consultarSaldo(
  usuarioId: string,
  input: ConsultarSaldoInput,
): Promise<{ saldo: number; nota: string }> {
  const { rows } = await pool.query<{ tipo: string; total: string }>(
    `select tipo, coalesce(sum(valor), 0) as total
       from transacao
      where usuario_id = $1
        and ($2::date is null or data >= $2::date)
        and ($3::uuid is null or conta_id = $3)
      group by tipo`,
    [usuarioId, input.data_inicio ?? null, input.conta_id ?? null],
  );

  let totalDespesas = 0;
  let totalReceitas = 0;
  for (const row of rows) {
    if (row.tipo === "despesa") totalDespesas = Number(row.total);
    if (row.tipo === "receita") totalReceitas = Number(row.total);
  }

  return {
    saldo: totalReceitas - totalDespesas,
    nota: "saldo baseado apenas no que foi registrado manualmente no assistente, nao e o saldo real da conta bancaria",
  };
}
