import { parseCsv } from "./csvParser.js";
import { parseOfx } from "./ofxParser.js";
import { ExtratoParseError, type ResultadoParseExtrato } from "./tipos.js";

export { ExtratoParseError } from "./tipos.js";
export type { LinhaExtrato, LinhaIgnorada, ResultadoParseExtrato } from "./tipos.js";
export { ehArquivoDeExtrato } from "./deteccao.js";
export { montarResumoExtratoParaLlm } from "./resumo.js";

/**
 * Decide OFX vs CSV pela extensao primeiro; sem extensao reconhecivel,
 * espia o inicio do conteudo (MIME type e pouco confiavel - Telegram manda
 * application/octet-stream pra varios tipos de documento).
 */
export function parseExtrato(buffer: Buffer, nomeArquivo: string, mimeType: string): ResultadoParseExtrato {
  const extensao = nomeArquivo.toLowerCase().split(".").pop();

  if (extensao === "ofx") return parseOfx(buffer);
  if (extensao === "csv") return parseCsv(buffer);

  const inicio = buffer.toString("utf8", 0, 200);
  if (/<OFX>|OFXHEADER:/i.test(inicio)) return parseOfx(buffer);
  if (mimeType === "text/csv" || mimeType === "application/vnd.ms-excel") return parseCsv(buffer);

  throw new ExtratoParseError(`não reconheci "${nomeArquivo}" como um extrato OFX ou CSV`);
}
