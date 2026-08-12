import { parse } from "csv-parse/sync";
import { ExtratoParseError, REGEX_PARCELA, type LinhaExtrato, type LinhaIgnorada, type ResultadoParseExtrato } from "./tipos.js";

/**
 * Casa primeiro contra assinaturas de cabecalho conhecidas (exports reais do
 * Nubank, com convencao de sinal e regras proprias que uma heuristica
 * generica nao adivinha com seguranca - ver docs/plano da feature). Sem
 * match, cai no parser heuristico generico (colunas por nome, convencao
 * padrao de extrato de conta).
 */

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Trata tanto "84,36" (BR) quanto "40.00" (ja padrao), e o prefixo "- " com espaco usado pelo CSV de fatura do Nubank em creditos. */
function parseValorBr(celula: string): { valor: number; negativo: boolean } {
  let s = celula.trim();
  let negativo = false;
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1).trim();
  }
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return { valor: Number(s), negativo };
}

function parseData(s: string): string | undefined {
  const valor = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(valor);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}

function detectarDelimitador(conteudo: string): "," | ";" {
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] ?? "";
  const colunasVirgula = primeiraLinha.split(",").length;
  const colunasPontoVirgula = primeiraLinha.split(";").length;
  return colunasPontoVirgula > colunasVirgula ? ";" : ",";
}

const HEADER_NUBANK_FATURA = ["date", "title", "amount"];
const HEADER_NUBANK_CONTA = ["data", "valor", "identificador", "descricao"];

function headerIgual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function parseNubankFatura(linhasDados: string[][]): ResultadoParseExtrato {
  const linhas: LinhaExtrato[] = [];
  const ignoradas: LinhaIgnorada[] = [];
  const avisos: string[] = [];

  linhasDados.forEach((row, i) => {
    const [dataBruta, title, amountBruto] = row;
    const data = dataBruta ? parseData(dataBruta) : undefined;
    const { valor, negativo } = amountBruto ? parseValorBr(amountBruto) : { valor: NaN, negativo: false };

    if (!data || !title || Number.isNaN(valor)) {
      avisos.push(`linha ${i + 2} da fatura ignorada - dado ilegível`);
      return;
    }

    if (negativo) {
      // credito na fatura: pagamento ou estorno - nunca uma transacao nova
      // (o pagamento real ja aparece no extrato da conta corrente).
      if (/^pagamento recebido/i.test(title)) {
        ignoradas.push({ data, valor, descricao: title, motivo: "pagamento da fatura (já refletido no extrato da conta corrente como 'Pagamento de fatura')" });
      } else if (/^estorno/i.test(title)) {
        ignoradas.push({ data, valor, descricao: title, motivo: "estorno de uma compra anterior (não casado automaticamente com a compra original)" });
      } else {
        ignoradas.push({ data, valor, descricao: title, motivo: "crédito na fatura não reconhecido automaticamente (nem pagamento nem estorno) - revise manualmente" });
      }
      return;
    }

    const parcela = REGEX_PARCELA.exec(title);
    linhas.push({
      data,
      valor,
      tipo: "despesa",
      descricao: title,
      parcelaAtual: parcela ? Number(parcela[2]) : undefined,
      parcelaTotal: parcela ? Number(parcela[3]) : undefined,
    });
  });

  return { linhas, ignoradas, avisos, origemProvavel: "fatura" };
}

function parseNubankConta(linhasDados: string[][]): ResultadoParseExtrato {
  const linhas: LinhaExtrato[] = [];
  const avisos: string[] = [];

  linhasDados.forEach((row, i) => {
    const [dataBruta, valorBruto, identificador, descricao] = row;
    const data = dataBruta ? parseData(dataBruta) : undefined;
    const { valor, negativo } = valorBruto ? parseValorBr(valorBruto) : { valor: NaN, negativo: false };

    if (!data || Number.isNaN(valor)) {
      avisos.push(`linha ${i + 2} do extrato ignorada - dado ilegível`);
      return;
    }

    linhas.push({
      data,
      valor,
      // convencao de extrato de conta: negativo = despesa, positivo = receita.
      tipo: negativo ? "despesa" : "receita",
      descricao: descricao || "(sem descrição)",
      identificadorExterno: identificador || undefined,
      categoriaSugerida: descricao && /^pagamento de fatura/i.test(descricao) ? "fatura de cartão" : undefined,
    });
  });

  return { linhas, ignoradas: [], avisos, origemProvavel: "conta" };
}

function parseGenerico(headerNorm: string[], linhasDados: string[][]): ResultadoParseExtrato {
  const idxData = headerNorm.findIndex((h) => ["data", "dt", "date"].includes(h) || h.includes("data"));
  const idxValor = headerNorm.findIndex((h) => ["valor", "montante", "vl", "amount"].includes(h) || h.includes("valor"));
  const idxDescricao = headerNorm.findIndex((h) => ["descricao", "historico", "lancamento", "title"].includes(h) || h.includes("descricao") || h.includes("historico"));
  const idxId = headerNorm.findIndex((h) => ["identificador", "id", "fitid"].includes(h));

  if (idxData === -1 || idxValor === -1) {
    throw new ExtratoParseError(
      `não consegui identificar as colunas de data e valor no CSV (cabeçalho encontrado: ${headerNorm.join(", ")})`,
    );
  }

  const linhas: LinhaExtrato[] = [];
  const avisos: string[] = [
    "formato de CSV não reconhecido automaticamente - assumindo convenção padrão de extrato de conta (valores negativos = despesa, positivos = receita). Se este for um extrato de fatura de cartão, a convenção pode estar invertida - confirme os valores antes de importar.",
  ];

  linhasDados.forEach((row, i) => {
    const dataBruta = row[idxData];
    const valorBruto = row[idxValor];
    const data = dataBruta ? parseData(dataBruta) : undefined;
    const { valor, negativo } = valorBruto ? parseValorBr(valorBruto) : { valor: NaN, negativo: false };

    if (!data || Number.isNaN(valor)) {
      avisos.push(`linha ${i + 2} ignorada - dado ilegível`);
      return;
    }

    linhas.push({
      data,
      valor,
      tipo: negativo ? "despesa" : "receita",
      descricao: idxDescricao !== -1 ? row[idxDescricao] ?? "" : "",
      identificadorExterno: idxId !== -1 ? row[idxId] || undefined : undefined,
    });
  });

  return { linhas, ignoradas: [], avisos };
}

export function parseCsv(buffer: Buffer): ResultadoParseExtrato {
  const conteudo = buffer.toString("utf8");
  const delimitador = detectarDelimitador(conteudo);

  const rows: string[][] = parse(conteudo, {
    delimiter: delimitador,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (rows.length < 2) {
    throw new ExtratoParseError("arquivo CSV vazio ou sem linhas de dados");
  }

  const header = rows[0]!;
  const headerNorm = header.map(normalizar);
  const linhasDados = rows.slice(1);

  if (headerIgual(headerNorm, HEADER_NUBANK_FATURA)) {
    return parseNubankFatura(linhasDados);
  }
  if (headerIgual(headerNorm, HEADER_NUBANK_CONTA)) {
    return parseNubankConta(linhasDados);
  }
  return parseGenerico(headerNorm, linhasDados);
}
