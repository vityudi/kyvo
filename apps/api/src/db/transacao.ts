import { logger } from "../lib/logger.js";
import { agoraSp, partesSp, resolverDataHoraLocalSp } from "../lib/tempo.js";
import { categoriaValida, contaPadrao, garantirCategoria } from "./categoria.js";
import { obterOuCriarFaturaAberta } from "./fatura.js";
import { pool } from "./pool.js";

export interface Transacao {
  id: string;
  tipo: "despesa" | "receita";
  valor: number;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data: string;
  data_hora: string;
  cartao_nome?: string | null;
  cartao_banco?: string | null;
}

interface RegistrarDespesaInput {
  valor: number;
  categoria: string;
  descricao: string;
  data?: string;
  hora?: string;
  conta_id?: string;
  cartao_id?: string;
  confianca?: "alta" | "media" | "baixa";
}

interface RegistrarReceitaInput {
  valor: number;
  fonte: string;
  descricao?: string;
  data?: string;
  hora?: string;
  conta_id?: string;
  confianca?: "alta" | "media" | "baixa";
}

interface EditarTransacaoInput {
  transacao_id: string;
  valor?: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data?: string;
  hora?: string;
}

/**
 * Resolve o `data_hora` a persistir a partir dos campos opcionais `data`
 * (YYYY-MM-DD) e `hora` (HH:mm[:ss]) informados pelo usuario/agente. Quando
 * so um dos dois vem preenchido, completa a parte que falta com a data ou
 * hora atuais (fuso America/Sao_Paulo) em vez de zerar - ex.: informar so a
 * `hora` de uma despesa de hoje nao deve jogar a data para outro dia.
 * Retorna undefined quando nenhum dos dois foi informado, para o insert usar
 * o default now() do banco.
 */
function resolverNovaDataHora(data?: string, hora?: string): string | undefined {
  if (!data && !hora) return undefined;
  const agora = agoraSp();
  return resolverDataHoraLocalSp(`${data ?? agora.data}T${hora ?? agora.hora}`);
}

/** Mesma ideia de `resolverNovaDataHora`, mas para edicao: a parte omitida
 * herda do `data_hora` atual da transacao, nao da hora "agora". */
function resolverDataHoraEdicao(atual: Date | string, novaData?: string, novaHora?: string): string | undefined {
  if (!novaData && !novaHora) return undefined;
  const atuais = partesSp(atual);
  return resolverDataHoraLocalSp(`${novaData ?? atuais.data}T${novaHora ?? atuais.hora}`);
}

interface ConsultarTransacoesInput {
  data_inicio: string;
  data_fim: string;
  tipo?: "despesa" | "receita" | "todos";
  categoria?: string;
  conta_id?: string;
  cartao_id?: string;
  fatura_id?: string;
  limite?: number;
  offset?: number;
}

interface ResumoPeriodoInput {
  data_inicio: string;
  data_fim: string;
  agrupar_por?: "categoria" | "conta" | "dia" | "nenhum";
  comparar_periodo_anterior?: boolean;
  cartao_id?: string;
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
): Promise<{
  transacao_id: string;
  valor: number;
  categoria: string;
  data: string;
  data_hora: string;
  saldo_categoria_mes: number;
}> {
  if (!(await categoriaValida(usuarioId, input.categoria, "despesa"))) {
    throw new Error(
      `categoria "${input.categoria}" nao reconhecida para despesas. Use uma categoria conhecida do usuario ou "outros".`,
    );
  }

  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));
  const dataHora = resolverNovaDataHora(input.data, input.hora);

  let criada: { id: string; valor: string; categoria: string; data: string; data_hora: string } | undefined;

  if (input.cartao_id) {
    // Compra no credito: precisa amarrar a transacao a fatura do ciclo
    // corrente do cartao (criando-a se for a primeira compra do ciclo) -
    // tudo numa unica transacao de banco pra nao deixar fatura orfa se o
    // insert da transacao falhar.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const faturaId = await obterOuCriarFaturaAberta(usuarioId, input.cartao_id, client);
      const { rows } = await client.query<{ id: string; valor: string; categoria: string; data: string; data_hora: string }>(
        `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, descricao, data_hora, confianca, fatura_id)
         values ($1, $2, 'despesa', $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8)
         returning id, valor, categoria, data, data_hora`,
        [usuarioId, contaId, input.valor, input.categoria, input.descricao, dataHora ?? null, input.confianca ?? null, faturaId],
      );
      criada = rows[0];
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    const { rows } = await pool.query<{ id: string; valor: string; categoria: string; data: string; data_hora: string }>(
      `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, descricao, data_hora, confianca)
       values ($1, $2, 'despesa', $3, $4, $5, coalesce($6::timestamptz, now()), $7)
       returning id, valor, categoria, data, data_hora`,
      [usuarioId, contaId, input.valor, input.categoria, input.descricao, dataHora ?? null, input.confianca ?? null],
    );
    criada = rows[0];
  }

  if (!criada) {
    throw new Error("falha ao registrar despesa - insert nao retornou linha");
  }

  const saldoCategoriaMes = await totalCategoriaNoMes(usuarioId, criada.categoria, criada.data);

  return {
    transacao_id: criada.id,
    valor: Number(criada.valor),
    categoria: criada.categoria,
    data: criada.data,
    data_hora: criada.data_hora,
    saldo_categoria_mes: saldoCategoriaMes,
  };
}

export async function registrarReceita(
  usuarioId: string,
  input: RegistrarReceitaInput,
): Promise<{
  transacao_id: string;
  valor: number;
  fonte: string;
  data: string;
  data_hora: string;
  total_receitas_mes: number;
}> {
  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));
  const dataHora = resolverNovaDataHora(input.data, input.hora);

  // categoria e denormalizada como texto livre (ver schema) - para receita
  // reaproveitamos a propria "fonte" como categoria, ja que a tool
  // registrar_receita nao expoe um campo categoria separado. Ao contrario de
  // despesa, aqui o agente pode cunhar uma fonte inedita (garantirCategoria
  // persiste pra ela virar "conhecida" e ser reaproveitada da proxima vez,
  // em vez do agente inventar uma variante especifica a cada transacao).
  await garantirCategoria(usuarioId, input.fonte, "receita");

  const { rows } = await pool.query<{ id: string; valor: string; fonte: string; data: string; data_hora: string }>(
    `insert into transacao (usuario_id, conta_id, tipo, valor, categoria, fonte, descricao, data_hora, confianca)
     values ($1, $2, 'receita', $3, $4, $4, $5, coalesce($6::timestamptz, now()), $7)
     returning id, valor, fonte, data, data_hora`,
    [usuarioId, contaId, input.valor, input.fonte, input.descricao ?? null, dataHora ?? null, input.confianca ?? null],
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
    data_hora: criada.data_hora,
    total_receitas_mes: totalReceitasMes,
  };
}

async function buscarTransacao(usuarioId: string, transacaoId: string): Promise<Transacao> {
  const { rows } = await pool.query<Transacao>(
    "select id, tipo, valor, categoria, descricao, fonte, data, data_hora from transacao where id = $1 and usuario_id = $2",
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

  // Receita usa a coluna "fonte" como o nome de campo pro usuario (ver
  // registrarReceita) - "categoria" e "fonte" guardam o mesmo valor pra essa
  // transacao, entao aceitamos ou o campo (o form do painel manda "fonte"
  // pra receita e "categoria" pra despesa - so um dos dois vem preenchido).
  const novaCategoria = input.categoria ?? input.fonte;

  if (novaCategoria) {
    if (atual.tipo === "despesa") {
      if (!(await categoriaValida(usuarioId, novaCategoria, "despesa"))) {
        throw new Error(`categoria "${novaCategoria}" nao reconhecida para despesas.`);
      }
    } else {
      // receita pode cunhar uma fonte inedita, mas persistimos ela como
      // categoria conhecida pra virar preferencia de reaproveitamento (ver
      // garantirCategoria)
      await garantirCategoria(usuarioId, novaCategoria, "receita");
    }
  }

  const novaDataHora = resolverDataHoraEdicao(atual.data_hora, input.data, input.hora);
  // so receita usa a coluna fonte (ver comentario acima) - despesa nunca
  // teve fonte preenchida, entao nao a tocamos nesse caso
  const novaFonte = atual.tipo === "receita" ? (novaCategoria ?? null) : null;

  const { rows } = await pool.query<Transacao>(
    `update transacao
        set valor         = coalesce($3, valor),
            categoria     = coalesce($4, categoria),
            fonte         = coalesce($7, fonte),
            descricao     = coalesce($5, descricao),
            data_hora     = coalesce($6::timestamptz, data_hora),
            atualizado_em = now()
      where id = $1 and usuario_id = $2
      returning id, tipo, valor, categoria, descricao, fonte, data, data_hora`,
    [
      input.transacao_id,
      usuarioId,
      input.valor ?? null,
      novaCategoria ?? null,
      input.descricao ?? null,
      novaDataHora ?? null,
      novaFonte,
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
  const offset = input.offset ?? 0;

  const { rows } = await pool.query<Transacao>(
    `select t.id, t.tipo, t.valor, t.categoria, t.descricao, t.fonte, t.data, t.data_hora, c.nome as cartao_nome, c.banco as cartao_banco
       from transacao t
       left join fatura f on f.id = t.fatura_id
       left join cartao c on c.id = f.cartao_id
      where t.usuario_id = $1
        and t.data between $2::date and $3::date
        and ($4::text = 'todos' or t.tipo = $4)
        and ($5::text is null or lower(t.categoria) = lower($5))
        and ($6::uuid is null or t.conta_id = $6)
        and ($7::uuid is null or c.id = $7)
        and ($8::uuid is null or t.fatura_id = $8)
      order by t.data_hora desc
      limit $9
      offset $10`,
    [
      usuarioId,
      input.data_inicio,
      input.data_fim,
      tipo,
      input.categoria ?? null,
      input.conta_id ?? null,
      input.cartao_id ?? null,
      input.fatura_id ?? null,
      limite,
      offset,
    ],
  );

  // `valor` e coluna `numeric` - o driver pg devolve como string por padrao
  // (evita perda de precisao), mas o tipo `Transacao.valor` e `number` -
  // sem essa conversao, somas no consumidor (ex.: painel web) viram
  // concatenacao de string em vez de soma.
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

export interface ResumoPeriodo {
  total_despesas: number;
  total_receitas: number;
  saldo: number;
  por_categoria?: { categoria: string; total: number }[];
  por_conta?: { conta_id: string; total: number }[];
  por_dia?: { data: string; total_despesas: number; total_receitas: number }[];
  periodo_anterior?: { total_despesas: number; variacao_percentual: number | null };
}

async function totaisPeriodo(
  usuarioId: string,
  dataInicio: string,
  dataFim: string,
  cartaoId?: string,
): Promise<{ total_despesas: number; total_receitas: number }> {
  const { rows } = await pool.query<{ tipo: string; total: string }>(
    `select t.tipo, coalesce(sum(t.valor), 0) as total
       from transacao t
       left join fatura f on f.id = t.fatura_id
      where t.usuario_id = $1 and t.data between $2::date and $3::date
        and ($4::uuid is null or f.cartao_id = $4)
      group by t.tipo`,
    [usuarioId, dataInicio, dataFim, cartaoId ?? null],
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

  const { total_despesas, total_receitas } = await totaisPeriodo(usuarioId, input.data_inicio, input.data_fim, input.cartao_id);

  const resumo: ResumoPeriodo = {
    total_despesas,
    total_receitas,
    saldo: total_receitas - total_despesas,
  };

  if (agruparPor === "categoria") {
    const { rows } = await pool.query<{ categoria: string; total: string }>(
      `select t.categoria, coalesce(sum(t.valor), 0) as total
         from transacao t
         left join fatura f on f.id = t.fatura_id
        where t.usuario_id = $1 and t.data between $2::date and $3::date and t.tipo = 'despesa'
          and ($4::uuid is null or f.cartao_id = $4)
        group by t.categoria
        order by total desc`,
      [usuarioId, input.data_inicio, input.data_fim, input.cartao_id ?? null],
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
  } else if (agruparPor === "dia") {
    // to_char forca a data a vir como string 'YYYY-MM-DD' - o driver pg
    // devolve colunas `date` como objeto Date por padrao, o que quebraria o
    // agrupamento por chave abaixo (duas instancias de Date nunca sao ===).
    const { rows } = await pool.query<{ data: string; tipo: string; total: string }>(
      `select to_char(data, 'YYYY-MM-DD') as data, tipo, coalesce(sum(valor), 0) as total
         from transacao
        where usuario_id = $1 and data between $2::date and $3::date
        group by data, tipo
        order by data asc`,
      [usuarioId, input.data_inicio, input.data_fim],
    );
    const porDiaMapa = new Map<string, { data: string; total_despesas: number; total_receitas: number }>();
    for (const r of rows) {
      const entrada = porDiaMapa.get(r.data) ?? { data: r.data, total_despesas: 0, total_receitas: 0 };
      if (r.tipo === "despesa") entrada.total_despesas = Number(r.total);
      if (r.tipo === "receita") entrada.total_receitas = Number(r.total);
      porDiaMapa.set(r.data, entrada);
    }
    resumo.por_dia = Array.from(porDiaMapa.values()).sort((a, b) => a.data.localeCompare(b.data));
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
      input.cartao_id,
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
        and not (tipo = 'despesa' and fatura_id is not null)
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
