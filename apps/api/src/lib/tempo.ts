const FUSO = "America/Sao_Paulo";

/**
 * Converte um horario local "ingenuo" (sem offset, ex.: '2026-07-20T09:00:00')
 * em um instante com offset fixo de America/Sao_Paulo, para o Postgres
 * armazenar como timestamptz correto. Nao ha timezone por usuario hoje em
 * nenhuma parte do app, e o Brasil nao observa horario de verao desde 2019,
 * entao um offset fixo -03:00 e seguro. Se o valor ja incluir um offset/Z,
 * usa como veio.
 */
export function resolverDataHoraLocalSp(dataHoraLocal: string): string {
  return /Z$|[+-]\d{2}:\d{2}$/.test(dataHoraLocal) ? dataHoraLocal : `${dataHoraLocal}-03:00`;
}

export interface PartesDataHora {
  data: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:mm:ss'
}

const FORMATADOR_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Decompoe um instante nas partes locais de data/hora em America/Sao_Paulo. */
export function partesSp(instante: Date | string): PartesDataHora {
  const d = instante instanceof Date ? instante : new Date(instante);
  const partes = Object.fromEntries(FORMATADOR_SP.formatToParts(d).map((p) => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}:${partes.second}` };
}

/** Data e hora atuais no fuso America/Sao_Paulo. */
export function agoraSp(): PartesDataHora {
  return partesSp(new Date());
}
