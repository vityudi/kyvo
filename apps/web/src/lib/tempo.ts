export function formatarTempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `${diffHoras}h`;
  const diffDias = Math.round(diffHoras / 24);
  if (diffDias < 7) return `${diffDias}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const INICIO_DO_DIA = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Rotulo de grupo (estilo "Hoje / Ontem / Ultimos 7 dias / ...") usado para agrupar a lista de conversas na sidebar. */
export function rotuloGrupoData(iso: string): string {
  const hoje = INICIO_DO_DIA(new Date());
  const dia = INICIO_DO_DIA(new Date(iso));
  const diffDias = Math.round((hoje - dia) / 86_400_000);

  if (diffDias <= 0) return "Hoje";
  if (diffDias === 1) return "Ontem";
  if (diffDias <= 7) return "Últimos 7 dias";
  if (diffDias <= 30) return "Últimos 30 dias";
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export interface IntervaloData {
  data_inicio: string;
  data_fim: string;
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function paraDataIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function intervaloDia(ref = new Date()): IntervaloData {
  const iso = paraDataIso(ref);
  return { data_inicio: iso, data_fim: iso };
}

/** Semana no padrao pt-BR (segunda a domingo). */
export function intervaloSemana(ref = new Date()): IntervaloData {
  const diaSemana = ref.getDay(); // 0 = domingo
  const deslocamentoAteSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

  const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - deslocamentoAteSegunda);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);

  return { data_inicio: paraDataIso(inicio), data_fim: paraDataIso(fim) };
}

export function intervaloMes(ref = new Date()): IntervaloData {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { data_inicio: paraDataIso(inicio), data_fim: paraDataIso(fim) };
}

function paraData(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Texto legivel do intervalo filtrado (ex.: "12 de agosto de 2026", "11 - 17 de agosto de 2026", "Agosto de 2026"). */
export function formatarPeriodoLegivel(
  data_inicio: string,
  data_fim: string,
  periodo: "dia" | "semana" | "mes",
): string {
  const inicio = paraData(data_inicio);

  if (periodo === "dia") {
    return inicio.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  }

  if (periodo === "mes") {
    const rotulo = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
  }

  const fim = paraData(data_fim);
  const mesmoMes = inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === fim.getFullYear();
  const textoInicio = inicio.toLocaleDateString("pt-BR", mesmoMes ? { day: "numeric" } : { day: "numeric", month: "short" });
  const textoFim = fim.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  return `${textoInicio} - ${textoFim}`;
}

/** Rotulo de cabecalho de grupo mensal, estilo extrato bancario (ex.: "Agosto 2026"). */
export function rotuloMesAno(iso: string): string {
  const data = paraData(iso.slice(0, 10));
  const rotulo = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", " ");
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
