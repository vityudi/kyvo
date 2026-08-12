import { request } from "./api";

export type TipoTransacao = "despesa" | "receita";

export interface Transacao {
  id: string;
  tipo: TipoTransacao;
  valor: number;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data: string;
}

export interface FiltroTransacoes {
  data_inicio: string;
  data_fim: string;
  tipo?: TipoTransacao | "todos";
  categoria?: string;
  limite?: number;
  offset?: number;
}

export function listarTransacoes(filtro: FiltroTransacoes): Promise<Transacao[]> {
  const params = new URLSearchParams({ data_inicio: filtro.data_inicio, data_fim: filtro.data_fim });
  if (filtro.tipo) params.set("tipo", filtro.tipo);
  if (filtro.categoria) params.set("categoria", filtro.categoria);
  if (filtro.limite) params.set("limite", String(filtro.limite));
  if (filtro.offset) params.set("offset", String(filtro.offset));
  return request(`/web/api/transacoes?${params}`);
}

export interface NovaTransacaoInput {
  tipo: TipoTransacao;
  valor: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data?: string;
}

export function criarTransacao(input: NovaTransacaoInput): Promise<unknown> {
  return request("/web/api/transacoes", { method: "POST", body: JSON.stringify(input) });
}

export interface EditarTransacaoInput {
  valor?: number;
  categoria?: string;
  descricao?: string;
  data?: string;
}

export function editarTransacao(id: string, input: EditarTransacaoInput): Promise<Transacao> {
  return request(`/web/api/transacoes/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function excluirTransacao(id: string): Promise<{ ok: true }> {
  return request(`/web/api/transacoes/${id}`, { method: "DELETE" });
}

export function listarCategoriasFinancas(tipo?: TipoTransacao): Promise<string[]> {
  const params = tipo ? `?tipo=${tipo}` : "";
  return request(`/web/api/categorias${params}`);
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

export interface FiltroResumo {
  data_inicio: string;
  data_fim: string;
  agrupar_por?: "categoria" | "conta" | "dia" | "nenhum";
}

export function obterResumoDashboard(filtro: FiltroResumo): Promise<ResumoPeriodo> {
  const params = new URLSearchParams({ data_inicio: filtro.data_inicio, data_fim: filtro.data_fim });
  if (filtro.agrupar_por) params.set("agrupar_por", filtro.agrupar_por);
  return request(`/web/api/dashboard/resumo?${params}`);
}
