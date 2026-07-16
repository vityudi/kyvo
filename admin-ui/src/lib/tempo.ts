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
