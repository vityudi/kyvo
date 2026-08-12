import { pool } from "./pool.js";

export interface Conta {
  id: string;
  nome: string;
  tipo: "manual" | "pluggy";
  saldo_inicial: number;
  /** saldo_inicial + soma(receitas) - soma(despesas) - sempre calculado em query, nunca desnormalizado. */
  saldo: number;
}

interface CriarContaInput {
  nome: string;
  saldo_inicial?: number;
}

interface EditarContaInput {
  conta_id: string;
  nome?: string;
  saldo_inicial?: number;
}

// Mesmo padrao de consultarSaldo em db/transacao.ts ("nota": so reflete o
// que foi registrado manualmente, nao e saldo bancario real) - aqui soma-se
// tambem o saldo_inicial informado na criacao/edicao da conta.
const SALDO_SUBQUERY =
  "c.saldo_inicial + coalesce((select sum(case when t.tipo = 'receita' then t.valor else -t.valor end) from transacao t where t.conta_id = c.id), 0) as saldo";

/**
 * Cria uma conta manual adicional. A primeira conta do usuario ja e criada
 * automaticamente em obterOuCriarUsuario() (db/usuario.ts) - esta funcao e
 * para quando ele quer separar as financas em mais de uma conta, o que muda
 * o comportamento de contaPadrao() (db/categoria.ts): com 2+ contas, deixa
 * de assumir uma conta unica e passa a exigir conta_id explicito.
 */
export async function criarConta(usuarioId: string, input: CriarContaInput): Promise<Conta> {
  const { rows } = await pool.query<{ id: string; nome: string; tipo: "manual" | "pluggy"; saldo_inicial: string }>(
    `insert into conta (usuario_id, nome, tipo, saldo_inicial)
     values ($1, $2, 'manual', $3)
     returning id, nome, tipo, saldo_inicial`,
    [usuarioId, input.nome, input.saldo_inicial ?? 0],
  );

  const criada = rows[0];
  if (!criada) {
    throw new Error("falha ao criar conta - insert nao retornou linha");
  }
  // Conta recem-criada nunca tem transacao - saldo sempre igual ao saldo_inicial, sem precisar de query extra.
  const saldoInicial = Number(criada.saldo_inicial);
  return { ...criada, saldo_inicial: saldoInicial, saldo: saldoInicial };
}

export async function listarContas(usuarioId: string): Promise<Conta[]> {
  const { rows } = await pool.query<{ id: string; nome: string; tipo: "manual" | "pluggy"; saldo_inicial: string; saldo: string }>(
    `select c.id, c.nome, c.tipo, c.saldo_inicial, ${SALDO_SUBQUERY}
       from conta c
      where c.usuario_id = $1
      order by c.criado_em asc`,
    [usuarioId],
  );
  return rows.map((r) => ({ ...r, saldo_inicial: Number(r.saldo_inicial), saldo: Number(r.saldo) }));
}

export async function editarConta(usuarioId: string, input: EditarContaInput): Promise<Conta> {
  const { rows } = await pool.query<{ id: string; nome: string; tipo: "manual" | "pluggy"; saldo_inicial: string }>(
    `update conta
        set nome          = coalesce($3, nome),
            saldo_inicial = coalesce($4, saldo_inicial)
      where id = $1 and usuario_id = $2
      returning id, nome, tipo, saldo_inicial`,
    [input.conta_id, usuarioId, input.nome ?? null, input.saldo_inicial ?? null],
  );

  const atualizada = rows[0];
  if (!atualizada) {
    throw new Error("conta nao encontrada ou nao pertence a este usuario");
  }
  const { rows: saldoRows } = await pool.query<{ saldo: string }>(
    `select coalesce(sum(case when tipo = 'receita' then valor else -valor end), 0) as saldo from transacao where conta_id = $1`,
    [atualizada.id],
  );
  const saldoInicial = Number(atualizada.saldo_inicial);
  return { ...atualizada, saldo_inicial: saldoInicial, saldo: saldoInicial + Number(saldoRows[0]?.saldo ?? 0) };
}

/**
 * Exclui uma conta permanentemente. So permite quando a conta esta "vazia"
 * (sem transacao/cartao/lancamento_futuro vinculados) e o usuario tem mais
 * de uma conta - excluir a unica conta ou uma com historico exigiria
 * decidir sozinho o que fazer com os registros dependentes (cascade
 * apagaria tudo, ver migrations 0001/0008/0010), entao preferimos recusar e
 * deixar o usuario mover/remover esses registros primeiro.
 */
export async function excluirConta(usuarioId: string, contaId: string): Promise<{ conta_id: string; ok: true }> {
  const { rows: totalRows } = await pool.query<{ total: string }>(
    `select count(*) as total from conta where usuario_id = $1`,
    [usuarioId],
  );
  if (Number(totalRows[0]?.total ?? 0) <= 1) {
    throw new Error("nao e possivel excluir a unica conta do usuario");
  }

  const { rows: usoRows } = await pool.query<{ transacoes: string; cartoes: string; lancamentos: string }>(
    `select
        (select count(*) from transacao where conta_id = $1) as transacoes,
        (select count(*) from cartao where conta_id = $1) as cartoes,
        (select count(*) from lancamento_futuro where conta_id = $1) as lancamentos`,
    [contaId],
  );
  const uso = usoRows[0];
  if (uso && (Number(uso.transacoes) > 0 || Number(uso.cartoes) > 0 || Number(uso.lancamentos) > 0)) {
    throw new Error(
      "conta possui transacoes, cartoes ou lancamentos futuros vinculados - nao pode ser excluida (mova ou remova esses registros antes, ou apenas renomeie a conta)",
    );
  }

  const { rowCount } = await pool.query(`delete from conta where id = $1 and usuario_id = $2`, [contaId, usuarioId]);
  if (!rowCount) {
    throw new Error("conta nao encontrada ou nao pertence a este usuario");
  }
  return { conta_id: contaId, ok: true };
}
