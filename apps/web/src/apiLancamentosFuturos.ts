import { request } from "./api";
import type { TipoTransacao } from "./apiFinancas";

export type StatusLancamentoFuturo = "pendente" | "lancado" | "cancelado";
export type Recorrencia = "diaria" | "semanal" | "mensal" | "anual";

export interface LancamentoFuturo {
  id: string;
  tipo: TipoTransacao;
  valor: number;
  categoria: string;
  descricao: string | null;
  fonte: string | null;
  data_prevista: string;
  recorrencia: Recorrencia | null;
  repeticoes_restantes: number | null;
  status: StatusLancamentoFuturo;
  transacao_id: string | null;
}

export interface FiltroLancamentosFuturos {
  status?: StatusLancamentoFuturo;
  tipo?: TipoTransacao;
  limite?: number;
}

export function listarLancamentosFuturos(filtro: FiltroLancamentosFuturos = {}): Promise<LancamentoFuturo[]> {
  const params = new URLSearchParams();
  if (filtro.status) params.set("status", filtro.status);
  if (filtro.tipo) params.set("tipo", filtro.tipo);
  if (filtro.limite) params.set("limite", String(filtro.limite));
  const query = params.toString();
  return request(`/web/api/lancamentos-futuros${query ? `?${query}` : ""}`);
}

export interface NovoLancamentoFuturoInput {
  tipo: TipoTransacao;
  valor: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data_prevista: string;
  hora?: string;
  recorrencia?: Recorrencia;
  repeticoes?: number;
}

export function criarLancamentoFuturo(input: NovoLancamentoFuturoInput): Promise<LancamentoFuturo> {
  return request("/web/api/lancamentos-futuros", { method: "POST", body: JSON.stringify(input) });
}

export interface EditarLancamentoFuturoInput {
  valor?: number;
  categoria?: string;
  descricao?: string;
  data_prevista?: string;
  hora?: string;
}

export function editarLancamentoFuturo(id: string, input: EditarLancamentoFuturoInput): Promise<LancamentoFuturo> {
  return request(`/web/api/lancamentos-futuros/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export interface ConfirmarLancamentoFuturoInput {
  valor?: number;
  data?: string;
  hora?: string;
}

export function confirmarLancamentoFuturo(id: string, input: ConfirmarLancamentoFuturoInput = {}): Promise<unknown> {
  return request(`/web/api/lancamentos-futuros/${id}/confirmar`, { method: "POST", body: JSON.stringify(input) });
}

export function cancelarLancamentoFuturo(id: string): Promise<{ ok: true }> {
  return request(`/web/api/lancamentos-futuros/${id}`, { method: "DELETE" });
}
