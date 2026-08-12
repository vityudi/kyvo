const MIME_TYPES_EXTRATO = new Set(["text/csv", "application/x-ofx", "application/vnd.ms-excel"]);

/** MIME type e pouco confiavel pra esses formatos (Telegram manda application/octet-stream, browsers variam) - extensao do nome do arquivo e o sinal mais forte. */
export function ehArquivoDeExtrato(nome: string | undefined, mimeType: string): boolean {
  const extensao = nome?.toLowerCase().split(".").pop();
  if (extensao === "csv" || extensao === "ofx") return true;
  return MIME_TYPES_EXTRATO.has(mimeType);
}
