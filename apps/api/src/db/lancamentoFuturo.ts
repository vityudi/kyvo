import { partesSp, resolverDataHoraLocalSp } from "../lib/tempo.js";
import { cancelarPendencia, criarLembrete, type Recorrencia } from "./lembrete.js";
import { categoriaValida, contaPadrao } from "./categoria.js";
import { pool } from "./pool.js";
import { registrarDespesa, registrarReceita } from "./transacao.js";

export type StatusLancamentoFuturo = "pendente" | "lancado" | "cancelado";

export interface LancamentoFuturo {
  id: string;
  tipo: "despesa" | "receita";
  valor: number;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data_prevista: string;
  recorrencia: Recorrencia | null;
  /** Quantas ocorrencias (contando esta) ainda restam antes de parar de repetir. null = repete indefinidamente ("Sempre"). Sempre null quando `recorrencia` e null. */
  repeticoes_restantes: number | null;
  status: StatusLancamentoFuturo;
  transacao_id: string | null;
  /** Preenchido quando este lancamento futuro representa a fatura em aberto de um cartao - ver db/fatura.ts. Quando preenchido, `valor` e sempre a soma das compras da fatura (nunca editavel manualmente) e `cartao_nome` identifica o cartao. */
  fatura_id: string | null;
  cartao_nome: string | null;
  cartao_banco: string | null;
}

interface CriarLancamentoFuturoInput {
  tipo: "despesa" | "receita";
  valor: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data_prevista: string; // YYYY-MM-DD, ja resolvida (ex.: proxima ocorrencia do dia mencionado)
  hora?: string; // HH:mm do lembrete de notificacao - default 09:00
  recorrencia?: Recorrencia;
  /** Quantas vezes repetir no total (contando esta primeira). Omitir para repetir indefinidamente ("Sempre"). So faz sentido junto de `recorrencia`. */
  repeticoes?: number;
  conta_id?: string;
}

interface ListarLancamentosFuturosInput {
  status?: StatusLancamentoFuturo;
  tipo?: "despesa" | "receita";
  limite?: number;
}

interface EditarLancamentoFuturoInput {
  lancamento_id: string;
  valor?: number;
  categoria?: string;
  descricao?: string;
  data_prevista?: string;
  hora?: string;
}

interface ConfirmarLancamentoFuturoInput {
  lancamento_id: string;
  valor?: number; // valor efetivamente pago/recebido, se diferente do previsto
  data?: string; // data em que de fato ocorreu, se diferente da prevista
  hora?: string;
}

const SELECT_CAMPOS =
  "id, tipo, valor, categoria, descricao, fonte, data_prevista, recorrencia, repeticoes_restantes, status, transacao_id";

function mapRow(row: {
  id: string;
  tipo: string;
  valor: string;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data_prevista: string;
  recorrencia: string | null;
  repeticoes_restantes: number | null;
  status: string;
  transacao_id: string | null;
  fatura_id?: string | null;
  cartao_nome?: string | null;
  cartao_banco?: string | null;
}): LancamentoFuturo {
  return {
    id: row.id,
    tipo: row.tipo as "despesa" | "receita",
    valor: Number(row.valor),
    categoria: row.categoria,
    descricao: row.descricao,
    fonte: row.fonte,
    data_prevista: row.data_prevista,
    recorrencia: row.recorrencia as Recorrencia | null,
    repeticoes_restantes: row.repeticoes_restantes,
    status: row.status as StatusLancamentoFuturo,
    transacao_id: row.transacao_id,
    fatura_id: row.fatura_id ?? null,
    cartao_nome: row.cartao_nome ?? null,
    cartao_banco: row.cartao_banco ?? null,
  };
}

// Quando fatura_id esta preenchido, `valor` NUNCA vem da coluna - e sempre
// recalculado como soma das compras de credito daquele ciclo (ver
// db/fatura.ts), pra fatura em aberto crescer sozinha a cada nova compra
// sem exigir edicao manual (ver criarLancamentoFuturo/obterOuCriarFaturaAberta).
const VALOR_CAMPO_CALCULADO = `case when lf.fatura_id is not null
     then coalesce((select sum(t.valor) from transacao t where t.fatura_id = lf.fatura_id), 0)
     else lf.valor end as valor`;

async function buscarLancamentoFuturo(
  usuarioId: string,
  lancamentoId: string,
): Promise<LancamentoFuturo & { conta_id: string; lembrete_id: string | null; lembrete_data_hora: Date | string | null }> {
  // to_char forca `data_prevista` a vir como string 'YYYY-MM-DD' - o driver pg
  // devolve colunas `date` como objeto Date por padrao (mesma pegadinha de
  // src/db/transacao.ts), o que quebraria a concatenacao de string em
  // resolverNovaDataHora/resolverDataHoraEdicao/avancarData mais abaixo.
  const { rows } = await pool.query(
    `select lf.id, lf.conta_id, lf.tipo, ${VALOR_CAMPO_CALCULADO}, lf.categoria, lf.descricao, lf.fonte,
            to_char(lf.data_prevista, 'YYYY-MM-DD') as data_prevista,
            lf.recorrencia, lf.repeticoes_restantes, lf.status, lf.transacao_id,
            lf.lembrete_id, l.data_hora as lembrete_data_hora,
            lf.fatura_id, c.nome as cartao_nome, c.banco as cartao_banco
       from lancamento_futuro lf
       left join lembrete l on l.id = lf.lembrete_id
       left join fatura f on f.id = lf.fatura_id
       left join cartao c on c.id = f.cartao_id
      where lf.id = $1 and lf.usuario_id = $2`,
    [lancamentoId, usuarioId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("lancamento futuro nao encontrado ou nao pertence a este usuario");
  }
  return { ...mapRow(row), conta_id: row.conta_id, lembrete_id: row.lembrete_id, lembrete_data_hora: row.lembrete_data_hora };
}

/** Avanca uma data (YYYY-MM-DD) pelo intervalo da recorrencia - usada pra criar a proxima ocorrencia pendente quando uma recorrente e confirmada (ver confirmarLancamentoFuturo). */
function avancarData(dataIso: string, recorrencia: Recorrencia): string {
  const d = new Date(`${dataIso}T00:00:00`);
  if (recorrencia === "diaria") d.setDate(d.getDate() + 1);
  else if (recorrencia === "semanal") d.setDate(d.getDate() + 7);
  else if (recorrencia === "mensal") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function criarLancamentoFuturo(
  usuarioId: string,
  input: CriarLancamentoFuturoInput,
): Promise<LancamentoFuturo> {
  const categoria = input.tipo === "receita" ? input.fonte : input.categoria;
  if (!categoria) {
    throw new Error(input.tipo === "receita" ? "informe a fonte da receita prevista" : "informe a categoria da despesa prevista");
  }
  if (!(await categoriaValida(usuarioId, categoria, input.tipo))) {
    throw new Error(`categoria "${categoria}" nao reconhecida para ${input.tipo}s. Use uma categoria conhecida do usuario ou "outros".`);
  }

  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));
  const hora = input.hora ?? "09:00";
  const dataHoraLembrete = resolverDataHoraLocalSp(`${input.data_prevista}T${hora}`);

  const descricaoLembrete = `${input.tipo === "despesa" ? "Pagar" : "Receber"}: ${input.descricao ?? categoria} (R$ ${input.valor.toFixed(2)})`;
  const lembrete = await criarLembrete(usuarioId, {
    descricao: descricaoLembrete,
    data_hora: dataHoraLembrete,
    recorrencia: input.recorrencia,
  });

  const { rows } = await pool.query(
    `insert into lancamento_futuro
        (usuario_id, conta_id, tipo, valor, categoria, fonte, descricao, data_prevista, recorrencia, repeticoes_restantes, lembrete_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11)
     returning ${SELECT_CAMPOS}`,
    [
      usuarioId,
      contaId,
      input.tipo,
      input.valor,
      categoria,
      input.tipo === "receita" ? categoria : null,
      input.descricao ?? null,
      input.data_prevista,
      input.recorrencia ?? null,
      input.recorrencia ? input.repeticoes ?? null : null,
      lembrete.id,
    ],
  );

  const criado = rows[0];
  if (!criado) {
    throw new Error("falha ao criar lancamento futuro - insert nao retornou linha");
  }
  return mapRow(criado);
}

export async function listarLancamentosFuturos(
  usuarioId: string,
  input: ListarLancamentosFuturosInput = {},
): Promise<LancamentoFuturo[]> {
  const status = input.status ?? "pendente";
  const limite = input.limite ?? 50;

  const { rows } = await pool.query(
    `select lf.id, lf.tipo, ${VALOR_CAMPO_CALCULADO}, lf.categoria, lf.descricao, lf.fonte,
            to_char(lf.data_prevista, 'YYYY-MM-DD') as data_prevista,
            lf.recorrencia, lf.repeticoes_restantes, lf.status, lf.transacao_id,
            lf.fatura_id, c.nome as cartao_nome, c.banco as cartao_banco
       from lancamento_futuro lf
       left join fatura f on f.id = lf.fatura_id
       left join cartao c on c.id = f.cartao_id
      where lf.usuario_id = $1
        and lf.status = $2
        and ($3::text is null or lf.tipo = $3)
      order by lf.data_prevista asc
      limit $4`,
    [usuarioId, status, input.tipo ?? null, limite],
  );
  return rows.map(mapRow);
}

export async function editarLancamentoFuturo(
  usuarioId: string,
  input: EditarLancamentoFuturoInput,
): Promise<LancamentoFuturo> {
  const atual = await buscarLancamentoFuturo(usuarioId, input.lancamento_id);
  if (atual.status !== "pendente") {
    throw new Error(`lancamento futuro ja esta ${atual.status}, nao pode ser editado`);
  }
  if (atual.fatura_id && input.valor != null) {
    throw new Error("faturas têm valor calculado automaticamente a partir das compras — edite/exclua a transação de crédito em vez disso");
  }
  if (input.categoria && !(await categoriaValida(usuarioId, input.categoria, atual.tipo))) {
    throw new Error(`categoria "${input.categoria}" nao reconhecida para ${atual.tipo}s.`);
  }

  const { rows } = await pool.query(
    `update lancamento_futuro
        set valor         = coalesce($3, valor),
            categoria     = coalesce($4, categoria),
            descricao     = coalesce($5, descricao),
            data_prevista = coalesce($6::date, data_prevista),
            atualizado_em = now()
      where id = $1 and usuario_id = $2
      returning ${SELECT_CAMPOS}`,
    [input.lancamento_id, usuarioId, input.valor ?? null, input.categoria ?? null, input.descricao ?? null, input.data_prevista ?? null],
  );

  const atualizado = rows[0];
  if (!atualizado) {
    throw new Error("falha ao editar lancamento futuro - update nao retornou linha");
  }

  // Mantem o lembrete de notificacao alinhado com a nova data/hora prevista,
  // se algo mudou nesse sentido.
  if ((input.data_prevista || input.hora) && atual.lembrete_id) {
    const horaAtualLembrete = atual.lembrete_data_hora ? partesSp(atual.lembrete_data_hora).hora : "09:00";
    const novaData = input.data_prevista ?? atual.data_prevista;
    const novaHora = input.hora ?? horaAtualLembrete;
    await pool.query(
      `update lembrete set data_hora = $2::timestamptz, atualizado_em = now() where id = $1 and status = 'pendente'`,
      [atual.lembrete_id, resolverDataHoraLocalSp(`${novaData}T${novaHora}`)],
    );
  }

  return mapRow(atualizado);
}

export async function confirmarLancamentoFuturo(
  usuarioId: string,
  input: ConfirmarLancamentoFuturoInput,
): Promise<{ lancamento_id: string; transacao_id: string; valor: number; data: string; proxima_ocorrencia_id?: string }> {
  const atual = await buscarLancamentoFuturo(usuarioId, input.lancamento_id);
  if (atual.status !== "pendente") {
    throw new Error(`lancamento futuro ja esta ${atual.status}`);
  }

  // Para faturas, `atual.valor` ja veio recalculado via SUM (buscarLancamentoFuturo)
  // - usa-lo como default aqui garante que o pagamento reflete exatamente o
  // total das compras do ciclo, mesmo que tenham entrado depois da criacao.
  const valor = input.valor ?? atual.valor;
  const data = input.data ?? atual.data_prevista;
  const descricaoPagamento = atual.fatura_id
    ? atual.descricao ?? `Pagamento fatura ${atual.cartao_nome ?? "cartão"}`
    : atual.descricao ?? atual.categoria;

  const resultado =
    atual.tipo === "despesa"
      ? await registrarDespesa(usuarioId, {
          valor,
          categoria: atual.fatura_id ? "fatura de cartão" : atual.categoria,
          descricao: descricaoPagamento,
          data,
          hora: input.hora,
        })
      : await registrarReceita(usuarioId, { valor, fonte: atual.fonte ?? atual.categoria, descricao: atual.descricao ?? undefined, data, hora: input.hora });

  await pool.query(
    `update lancamento_futuro
        set status = 'lancado', transacao_id = $3, atualizado_em = now()
      where id = $1 and usuario_id = $2`,
    [input.lancamento_id, usuarioId, resultado.transacao_id],
  );

  if (atual.fatura_id) {
    await pool.query(
      `update fatura set status = 'paga', transacao_pagamento_id = $2, atualizado_em = now() where id = $1`,
      [atual.fatura_id, resultado.transacao_id],
    );
  }

  // Recorrente: confirmar uma ocorrencia nao deve fazer a cadeia toda
  // desaparecer - cria de ja a proxima ocorrencia pendente (mesmo
  // valor/categoria previstos, data avancada pelo intervalo), vinculada ao
  // mesmo lembrete recorrente (que ja vai notificar de novo nessa data) - a
  // nao ser que `repeticoes_restantes` (ver criar_lancamento_futuro) tenha
  // acabado de zerar, aí a serie termina aqui.
  const repeticoesRestantesDepois =
    atual.recorrencia && atual.repeticoes_restantes != null ? atual.repeticoes_restantes - 1 : null;
  const serieContinua = atual.recorrencia != null && (atual.repeticoes_restantes == null || repeticoesRestantesDepois! > 0);

  let proximaOcorrenciaId: string | undefined;
  if (serieContinua && atual.recorrencia) {
    const proximaData = avancarData(atual.data_prevista, atual.recorrencia);
    const { rows } = await pool.query(
      `insert into lancamento_futuro
          (usuario_id, conta_id, tipo, valor, categoria, fonte, descricao, data_prevista, recorrencia, repeticoes_restantes, lembrete_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11)
       returning id`,
      [
        usuarioId,
        atual.conta_id,
        atual.tipo,
        atual.valor,
        atual.categoria,
        atual.fonte,
        atual.descricao,
        proximaData,
        atual.recorrencia,
        repeticoesRestantesDepois,
        atual.lembrete_id,
      ],
    );
    proximaOcorrenciaId = rows[0]?.id;
  }

  // Ja foi pago/recebido - nao ha mais necessidade de notificar, a nao ser
  // que a serie recorrente continue (nesse caso o lembrete fica vivo pro
  // proximo ciclo).
  if (atual.lembrete_id && !serieContinua) {
    await cancelarPendencia(usuarioId, atual.lembrete_id).catch(() => undefined);
  }

  return { lancamento_id: input.lancamento_id, transacao_id: resultado.transacao_id, valor, data, proxima_ocorrencia_id: proximaOcorrenciaId };
}

export async function cancelarLancamentoFuturo(
  usuarioId: string,
  lancamentoId: string,
): Promise<{ lancamento_id: string; ok: true }> {
  const atual = await buscarLancamentoFuturo(usuarioId, lancamentoId);
  if (atual.fatura_id) {
    throw new Error("faturas não podem ser canceladas — cancele/exclua as transações de crédito do ciclo em vez disso");
  }
  if (atual.status !== "pendente") {
    throw new Error(`lancamento futuro ja esta ${atual.status}`);
  }

  await pool.query(
    `update lancamento_futuro set status = 'cancelado', atualizado_em = now() where id = $1 and usuario_id = $2`,
    [lancamentoId, usuarioId],
  );

  if (atual.lembrete_id) {
    await cancelarPendencia(usuarioId, atual.lembrete_id).catch(() => undefined);
  }

  return { lancamento_id: lancamentoId, ok: true };
}
