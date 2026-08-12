/** Sufixo "- Parcela N/M" usado pelo Nubank (e possivelmente outros bancos) pra indicar compra parcelada. Compartilhado entre o parser e a importacao (fallback quando o LLM nao repassa parcela_atual/parcela_total explicitamente). */
export const REGEX_PARCELA = /^(.*?)\s*-\s*Parcela\s+(\d+)\/(\d+)\s*$/i;

export interface LinhaExtrato {
  data: string; // YYYY-MM-DD
  valor: number; // sempre positivo
  tipo: "despesa" | "receita";
  descricao: string;
  /** FITID (OFX) ou Identificador (CSV Nubank conta) - id estavel do banco, quando existir. */
  identificadorExterno?: string;
  parcelaAtual?: number;
  parcelaTotal?: number;
  /** Dica opcional de categoria (ex.: "fatura de cartão" para "Pagamento de fatura") - a IA ainda decide. */
  categoriaSugerida?: string;
}

export interface LinhaIgnorada {
  data: string;
  valor: number;
  descricao: string;
  /** Ex.: "pagamento de fatura (já refletido na conta)", "estorno". */
  motivo: string;
}

export class ExtratoParseError extends Error {}

export interface ResultadoParseExtrato {
  linhas: LinhaExtrato[];
  ignoradas: LinhaIgnorada[];
  /** Linhas malformadas, puladas individualmente sem abortar o parse inteiro. */
  avisos: string[];
  origemProvavel?: "conta" | "fatura";
}
