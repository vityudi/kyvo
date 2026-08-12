import { contaPadrao } from "./categoria.js";
import { pool } from "./pool.js";

export interface Cartao {
  id: string;
  conta_id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  ativo: boolean;
  /** Chave do banco/emissor (ex.: 'nubank', 'itau') para o painel desenhar a cor de marca do cartao - so estetico, ver apps/web/src/lib/bancos.ts. Null = visual generico. */
  banco: string | null;
}

interface CriarCartaoInput {
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  conta_id?: string;
  banco?: string;
}

interface ListarCartoesInput {
  ativo?: boolean;
}

interface EditarCartaoInput {
  cartao_id: string;
  nome?: string;
  dia_fechamento?: number;
  dia_vencimento?: number;
  banco?: string;
}

const SELECT_CAMPOS = "id, conta_id, nome, dia_fechamento, dia_vencimento, ativo, banco";

export async function criarCartao(usuarioId: string, input: CriarCartaoInput): Promise<Cartao> {
  const contaId = input.conta_id ?? (await contaPadrao(usuarioId));

  const { rows } = await pool.query<Cartao>(
    `insert into cartao (usuario_id, conta_id, nome, dia_fechamento, dia_vencimento, banco)
     values ($1, $2, $3, $4, $5, $6)
     returning ${SELECT_CAMPOS}`,
    [usuarioId, contaId, input.nome, input.dia_fechamento, input.dia_vencimento, input.banco ?? null],
  );

  const criado = rows[0];
  if (!criado) {
    throw new Error("falha ao criar cartao - insert nao retornou linha");
  }
  return criado;
}

export async function listarCartoes(usuarioId: string, input: ListarCartoesInput = {}): Promise<Cartao[]> {
  const ativo = input.ativo ?? true;
  const { rows } = await pool.query<Cartao>(
    `select ${SELECT_CAMPOS}
       from cartao
      where usuario_id = $1 and ativo = $2
      order by criado_em asc`,
    [usuarioId, ativo],
  );
  return rows;
}

/** Usada por registrarDespesa para validar que o cartao existe, pertence ao usuario e esta ativo antes de vincular uma compra. */
export async function buscarCartaoAtivo(usuarioId: string, cartaoId: string): Promise<Cartao> {
  const { rows } = await pool.query<Cartao>(
    `select ${SELECT_CAMPOS} from cartao where id = $1 and usuario_id = $2 and ativo = true`,
    [cartaoId, usuarioId],
  );
  const cartao = rows[0];
  if (!cartao) {
    throw new Error("cartao nao encontrado, inativo, ou nao pertence a este usuario");
  }
  return cartao;
}

export async function editarCartao(usuarioId: string, input: EditarCartaoInput): Promise<Cartao> {
  const { rows } = await pool.query<Cartao>(
    `update cartao
        set nome           = coalesce($3, nome),
            dia_fechamento = coalesce($4, dia_fechamento),
            dia_vencimento = coalesce($5, dia_vencimento),
            banco          = coalesce($6, banco),
            atualizado_em  = now()
      where id = $1 and usuario_id = $2
      returning ${SELECT_CAMPOS}`,
    [input.cartao_id, usuarioId, input.nome ?? null, input.dia_fechamento ?? null, input.dia_vencimento ?? null, input.banco ?? null],
  );

  const atualizado = rows[0];
  if (!atualizado) {
    throw new Error("cartao nao encontrado ou nao pertence a este usuario");
  }
  return atualizado;
}

export async function desativarCartao(usuarioId: string, cartaoId: string): Promise<{ cartao_id: string; ok: true }> {
  const { rowCount } = await pool.query(
    `update cartao set ativo = false, atualizado_em = now() where id = $1 and usuario_id = $2`,
    [cartaoId, usuarioId],
  );
  if (!rowCount) {
    throw new Error("cartao nao encontrado ou nao pertence a este usuario");
  }
  return { cartao_id: cartaoId, ok: true };
}
