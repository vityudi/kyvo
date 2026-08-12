import { request } from "./api";

export interface Conta {
  id: string;
  nome: string;
  tipo: "manual" | "pluggy";
  saldo_inicial: number;
  saldo: number;
}

export function listarContas(): Promise<Conta[]> {
  return request("/web/api/contas");
}

export interface NovaContaInput {
  nome: string;
  saldo_inicial?: number;
}

export function criarConta(input: NovaContaInput): Promise<Conta> {
  return request("/web/api/contas", { method: "POST", body: JSON.stringify(input) });
}

export interface EditarContaInput {
  nome?: string;
  saldo_inicial?: number;
}

export function editarConta(id: string, input: EditarContaInput): Promise<Conta> {
  return request(`/web/api/contas/${id}`, { method: "PUT", body: JSON.stringify(input) });
}
