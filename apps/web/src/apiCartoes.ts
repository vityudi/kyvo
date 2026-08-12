import { request } from "./api";

export interface Cartao {
  id: string;
  conta_id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  ativo: boolean;
  banco: string | null;
}

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

export function listarCartoes(): Promise<Cartao[]> {
  return request("/web/api/cartoes");
}

export interface NovoCartaoInput {
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  conta_id?: string;
  banco?: string;
}

export function criarCartao(input: NovoCartaoInput): Promise<Cartao> {
  return request("/web/api/cartoes", { method: "POST", body: JSON.stringify(input) });
}

export interface EditarCartaoInput {
  nome?: string;
  dia_fechamento?: number;
  dia_vencimento?: number;
  banco?: string;
}

export function editarCartao(id: string, input: EditarCartaoInput): Promise<Cartao> {
  return request(`/web/api/cartoes/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function desativarCartao(id: string): Promise<{ ok: true }> {
  return request(`/web/api/cartoes/${id}`, { method: "DELETE" });
}

export function listarFaturasDoCartao(cartaoId: string, status?: StatusFatura): Promise<Fatura[]> {
  const query = status ? `?status=${status}` : "";
  return request(`/web/api/cartoes/${cartaoId}/faturas${query}`);
}

export interface TransacaoFatura {
  id: string;
  valor: number;
  categoria: string;
  descricao: string | null;
  data: string;
  data_hora: string;
}

export function listarTransacoesDaFatura(faturaId: string): Promise<TransacaoFatura[]> {
  return request(`/web/api/faturas/${faturaId}/transacoes`);
}
