import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { obterResumoDashboard, type ResumoPeriodo } from "../apiFinancas";
import { corCategoria } from "../lib/categoriaCores";
import { pollingVisivel } from "../lib/pollingVisivel";
import type { IntervaloData } from "../lib/tempo";
import { useChartColors, useTheme } from "../lib/theme";
import { SeletorPeriodo } from "./SeletorPeriodo";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataCurta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatarValorCompacto(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
}

function formatarSaldoCompacto(valor: number): string {
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";
  return `${sinal}${formatarValorCompacto(Math.abs(valor))}`;
}

const MESES_ANTES = 6;
const MESES_DEPOIS = 3;

/** Intervalo fixo (independente do periodo selecionado no topo) usado na visao anual: N meses antes do mes atual ate M meses depois. */
function intervaloVisaoAnual(ref = new Date()): IntervaloData {
  const inicio = new Date(ref.getFullYear(), ref.getMonth() - MESES_ANTES, 1);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + MESES_DEPOIS + 1, 0);
  const paraIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { data_inicio: paraIso(inicio), data_fim: paraIso(fim) };
}

interface MesAnual {
  chave: string;
  mes: string;
  Despesas: number;
  Receitas: number;
  atual: boolean;
}

/** Agrupa o resumo diario (que ja cobre o intervalo da visao anual) em baldes mensais, do mais antigo ao mais recente. */
function agruparPorMes(porDia: ResumoPeriodo["por_dia"], ref = new Date()): MesAnual[] {
  const chaveAtual = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const baldes = new Map<string, MesAnual>();

  for (let i = -MESES_ANTES; i <= MESES_DEPOIS; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rotulo = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
    baldes.set(chave, {
      chave,
      mes: rotulo.charAt(0).toUpperCase() + rotulo.slice(1),
      Despesas: 0,
      Receitas: 0,
      atual: chave === chaveAtual,
    });
  }

  for (const d of porDia ?? []) {
    const chave = d.data.slice(0, 7);
    const balde = baldes.get(chave);
    if (!balde) continue;
    balde.Despesas += d.total_despesas;
    balde.Receitas += d.total_receitas;
  }

  return [...baldes.values()];
}

/** Mini-barra horizontal de um valor (despesa ou receita) dentro de um mes, escalada pelo maior valor entre todos os meses exibidos. */
function BarraMes({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const pct = maximo > 0 ? Math.max((valor / maximo) * 100, valor > 0 ? 3 : 0) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-glass">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
      <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-text-tertiary">
        {formatarValorCompacto(valor)}
      </span>
    </div>
  );
}

export function DashboardView() {
  const [intervalo, setIntervalo] = useState<IntervaloData | null>(null);
  const [resumo, setResumo] = useState<ResumoPeriodo | null>(null);
  const [resumoDiario, setResumoDiario] = useState<ResumoPeriodo | null>(null);
  const [resumoAnual, setResumoAnual] = useState<ResumoPeriodo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { escuro } = useTheme();
  const cores = useChartColors(escuro);

  useEffect(() => {
    if (!intervalo) return;
    let cancelado = false;
    const { data_inicio, data_fim } = intervalo;

    async function carregar() {
      try {
        const [porCategoria, porDia] = await Promise.all([
          obterResumoDashboard({ data_inicio, data_fim, agrupar_por: "categoria" }),
          obterResumoDashboard({ data_inicio, data_fim, agrupar_por: "dia" }),
        ]);
        if (cancelado) return;
        setResumo(porCategoria);
        setResumoDiario(porDia);
        setErro(null);
      } catch (err) {
        if (!cancelado) setErro(err instanceof Error ? err.message : String(err));
      }
    }

    carregar();
    const pararPolling = pollingVisivel(carregar, 10_000);
    return () => {
      cancelado = true;
      pararPolling();
    };
  }, [intervalo]);

  useEffect(() => {
    let cancelado = false;
    const { data_inicio, data_fim } = intervaloVisaoAnual();

    async function carregar() {
      try {
        const porDia = await obterResumoDashboard({ data_inicio, data_fim, agrupar_por: "dia" });
        if (!cancelado) setResumoAnual(porDia);
      } catch {
        // silencioso - a visao anual e um complemento, um erro pontual aqui nao deve travar o resto do dashboard
      }
    }

    carregar();
    const pararPolling = pollingVisivel(carregar, 10_000);
    return () => {
      cancelado = true;
      pararPolling();
    };
  }, []);

  const dadosSerie =
    resumoDiario?.por_dia?.map((d) => ({
      data: formatarDataCurta(d.data),
      Despesas: d.total_despesas,
      Receitas: d.total_receitas,
    })) ?? [];

  const dadosAnual = agruparPorMes(resumoAnual?.por_dia);
  const maiorValorAnual = Math.max(1, ...dadosAnual.flatMap((d) => [d.Despesas, d.Receitas]));

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <SeletorPeriodo onChange={(_periodo, novoIntervalo) => setIntervalo(novoIntervalo)} />

      {erro && <p className="text-[12.5px] text-danger">Falha ao carregar: {erro}</p>}

      {resumo && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-text-tertiary">Despesas</p>
              <p className="mt-1 text-[19px] font-bold text-danger">{formatarValor(resumo.total_despesas)}</p>
              {resumo.periodo_anterior?.variacao_percentual !== null &&
                resumo.periodo_anterior?.variacao_percentual !== undefined && (
                  <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                    {resumo.periodo_anterior.variacao_percentual >= 0 ? "+" : ""}
                    {resumo.periodo_anterior.variacao_percentual.toFixed(1)}% vs. período anterior
                  </p>
                )}
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-text-tertiary">Receitas</p>
              <p className="mt-1 text-[19px] font-bold text-success">{formatarValor(resumo.total_receitas)}</p>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-text-tertiary">Saldo</p>
              <p className="mt-1 text-[19px] font-bold text-text-primary">{formatarValor(resumo.saldo)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-1 flex-col gap-4">
              <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
                <p className="mb-3 text-[12.5px] font-bold text-text-primary">Despesas por categoria</p>
                {resumo.por_categoria && resumo.por_categoria.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={resumo.por_categoria}
                        dataKey="total"
                        nameKey="categoria"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {resumo.por_categoria.map((c) => (
                          <Cell key={c.categoria} fill={corCategoria(c.categoria)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => formatarValor(Number(v))}
                        contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--border-subtle)", borderRadius: 10 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11.5, color: cores.texto }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-14 text-center text-[12.5px] text-text-secondary">Sem despesas no período.</p>
                )}
              </div>

              <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
                <p className="mb-3 text-[12.5px] font-bold text-text-primary">Evolução no período</p>
                {dadosSerie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={dadosSerie}>
                      <CartesianGrid stroke={cores.grid} vertical={false} />
                      <XAxis dataKey="data" stroke={cores.texto} fontSize={11.5} />
                      <YAxis stroke={cores.texto} fontSize={11.5} />
                      <Tooltip
                        formatter={(v) => formatarValor(Number(v))}
                        contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--border-subtle)", borderRadius: 10 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11.5, color: cores.texto }} />
                      <Area type="monotone" dataKey="Despesas" stroke={cores.despesa} fill={cores.despesa} fillOpacity={0.15} />
                      <Area type="monotone" dataKey="Receitas" stroke={cores.receita} fill={cores.receita} fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-[12.5px] text-text-secondary">Sem lançamentos no período.</p>
                )}
              </div>
            </div>

            <div className="flex flex-col rounded-[14px] border border-border-subtle bg-glass-strong p-4 lg:w-[340px]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12.5px] font-bold text-text-primary">Visão anual</p>
                <div className="flex items-center gap-2.5 text-[10.5px] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cores.despesa }} />
                    Despesas
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cores.receita }} />
                    Receitas
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between">
                {dadosAnual.map((d) => {
                  const saldo = d.Receitas - d.Despesas;
                  return (
                    <div
                      key={d.chave}
                      className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${d.atual ? "bg-accent/10" : ""}`}
                    >
                      <span className={`w-9 shrink-0 text-[11px] font-semibold ${d.atual ? "text-accent" : "text-text-tertiary"}`}>
                        {d.mes}
                      </span>
                      <div className="flex-1 space-y-1">
                        <BarraMes valor={d.Despesas} maximo={maiorValorAnual} cor={cores.despesa} />
                        <BarraMes valor={d.Receitas} maximo={maiorValorAnual} cor={cores.receita} />
                      </div>
                      <span
                        className={`w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                          saldo > 0 ? "text-success" : saldo < 0 ? "text-danger" : "text-text-tertiary"
                        }`}
                      >
                        {formatarSaldoCompacto(saldo)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
