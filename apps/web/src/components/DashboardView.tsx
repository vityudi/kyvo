import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import type { IntervaloData } from "../lib/tempo";
import { useChartColors, useTheme } from "../lib/theme";
import { SeletorPeriodo } from "./SeletorPeriodo";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataCurta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function DashboardView() {
  const [intervalo, setIntervalo] = useState<IntervaloData | null>(null);
  const [resumo, setResumo] = useState<ResumoPeriodo | null>(null);
  const [resumoDiario, setResumoDiario] = useState<ResumoPeriodo | null>(null);
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
    const intervaloPolling = setInterval(carregar, 10_000);
    return () => {
      cancelado = true;
      clearInterval(intervaloPolling);
    };
  }, [intervalo]);

  const dadosComparativo = resumo
    ? [{ nome: "Período", Despesas: resumo.total_despesas, Receitas: resumo.total_receitas }]
    : [];

  const dadosSerie =
    resumoDiario?.por_dia?.map((d) => ({
      data: formatarDataCurta(d.data),
      Despesas: d.total_despesas,
      Receitas: d.total_receitas,
    })) ?? [];

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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <p className="mb-3 text-[12.5px] font-bold text-text-primary">Receita vs. despesa</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dadosComparativo}>
                  <CartesianGrid stroke={cores.grid} vertical={false} />
                  <XAxis dataKey="nome" stroke={cores.texto} fontSize={11.5} />
                  <YAxis stroke={cores.texto} fontSize={11.5} />
                  <Tooltip
                    formatter={(v) => formatarValor(Number(v))}
                    contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--border-subtle)", borderRadius: 10 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11.5, color: cores.texto }} />
                  <Bar dataKey="Despesas" fill={cores.despesa} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Receitas" fill={cores.receita} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[14px] border border-border-subtle bg-glass-strong p-4">
            <p className="mb-3 text-[12.5px] font-bold text-text-primary">Evolução no período</p>
            {dadosSerie.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
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
              <p className="py-14 text-center text-[12.5px] text-text-secondary">Sem lançamentos no período.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
