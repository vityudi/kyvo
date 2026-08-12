import { ExtratoParseError, type LinhaExtrato, type ResultadoParseExtrato } from "./tipos.js";

/**
 * Parser hand-rolled para OFX (SGML `<TAG>valor` ou XML `<TAG>valor</TAG>`,
 * ambos usados por bancos brasileiros) - o formato e simples o bastante
 * (tags planas dentro de blocos <STMTTRN>) pra nao justificar dependencia
 * externa (a maioria dos pacotes OFX no npm esta abandonada ha anos).
 */

const REGEX_STMTTRN = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;

function extrairTag(bloco: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>\\s*([^<\r\n]*)`, "i").exec(bloco);
  return match?.[1]?.trim() || undefined;
}

function parseDataOfx(dtposted: string): string | undefined {
  // formato DTPOSTED: YYYYMMDD[HHMMSS][.xxx][+TZ] ou YYYYMMDD[HHMMSS][[-3:BRT]]
  const digitos = dtposted.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!digitos) return undefined;
  const [, ano, mes, dia] = digitos;
  return `${ano}-${mes}-${dia}`;
}

export function parseOfx(buffer: Buffer): ResultadoParseExtrato {
  const conteudo = buffer.toString("utf8");
  const linhas: LinhaExtrato[] = [];
  const avisos: string[] = [];

  let match: RegExpExecArray | null;
  REGEX_STMTTRN.lastIndex = 0;
  let totalBlocos = 0;

  while ((match = REGEX_STMTTRN.exec(conteudo)) !== null) {
    totalBlocos++;
    const bloco = match[1] ?? "";

    const dtposted = extrairTag(bloco, "DTPOSTED");
    const trnamt = extrairTag(bloco, "TRNAMT");
    const fitid = extrairTag(bloco, "FITID");
    const memo = extrairTag(bloco, "MEMO");
    const name = extrairTag(bloco, "NAME");

    const data = dtposted ? parseDataOfx(dtposted) : undefined;
    const valorBruto = trnamt ? Number(trnamt.replace(",", ".")) : NaN;

    if (!data || Number.isNaN(valorBruto)) {
      avisos.push(`transação #${totalBlocos} do OFX ignorada - data ou valor ilegível`);
      continue;
    }

    linhas.push({
      data,
      valor: Math.abs(valorBruto),
      // convencao padrao de extrato: negativo = despesa, positivo = receita
      // (nao confiar em TRNTYPE, que alguns bancos preenchem errado).
      tipo: valorBruto < 0 ? "despesa" : "receita",
      descricao: memo || name || "(sem descrição)",
      identificadorExterno: fitid,
    });
  }

  if (totalBlocos === 0) {
    throw new ExtratoParseError("não encontrei nenhuma transação (bloco <STMTTRN>) neste arquivo OFX");
  }

  return { linhas, ignoradas: [], avisos };
}
