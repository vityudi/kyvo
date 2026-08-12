import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatarPeriodoLegivel, intervaloDia, intervaloMes, intervaloSemana, MESES, type IntervaloData } from "../lib/tempo";
import { Dropdown } from "./Dropdown";

export type Periodo = "dia" | "semana" | "mes";

interface Props {
  onChange: (periodo: Periodo, intervalo: IntervaloData) => void;
  /** Periodo inicial (default "mes"). */
  periodoInicial?: Periodo;
  /** Incrementar esse numero reseta o seletor para periodoInicial + hoje - usado pelo botao "Limpar" do consumidor. */
  reiniciarSinal?: number;
}

function intervaloDoPeriodo(periodo: Periodo, ref: Date): IntervaloData {
  if (periodo === "dia") return intervaloDia(ref);
  if (periodo === "semana") return intervaloSemana(ref);
  return intervaloMes(ref);
}

/** Desloca a data de referencia um passo do periodo atual (dia/semana/mes). Mes sempre normaliza pro dia 1 - evita deriva ao navegar repetidamente (ex.: dia 31 - 1 mes rolando pro mes seguinte em JS Date). */
function deslocar(ref: Date, periodo: Periodo, direcao: 1 | -1): Date {
  if (periodo === "dia") {
    const novo = new Date(ref);
    novo.setDate(novo.getDate() + direcao);
    return novo;
  }
  if (periodo === "semana") {
    const novo = new Date(ref);
    novo.setDate(novo.getDate() + direcao * 7);
    return novo;
  }
  return new Date(ref.getFullYear(), ref.getMonth() + direcao, 1);
}

const OPCOES_MES = MESES.map((nome, i) => ({ value: i, label: nome }));

/** Intervalo sempre inclui o ano selecionado, mesmo apos navegar com as setas < > para alem do intervalo padrao (ano atual -6 a +1). */
function opcoesAno(anoSelecionado: number): { value: number; label: string }[] {
  const anoAtual = new Date().getFullYear();
  const max = Math.max(anoAtual, anoSelecionado) + 1;
  const min = Math.min(anoAtual, anoSelecionado) - 6;
  const anos: number[] = [];
  for (let a = max; a >= min; a--) anos.push(a);
  return anos.map((a) => ({ value: a, label: String(a) }));
}

export function SeletorPeriodo({ onChange, periodoInicial = "mes", reiniciarSinal }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [dataReferencia, setDataReferencia] = useState(() => new Date());
  const [popoverAberto, setPopoverAberto] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(dataReferencia.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(dataReferencia.getFullYear());
  const popoverRef = useRef<HTMLDivElement>(null);

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, dataReferencia), [periodo, dataReferencia]);

  useEffect(() => {
    onChange(periodo, intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, intervalo.data_inicio, intervalo.data_fim]);

  useEffect(() => {
    if (reiniciarSinal === undefined) return;
    setPeriodo(periodoInicial);
    setDataReferencia(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reiniciarSinal]);

  useEffect(() => {
    if (!popoverAberto) return;
    function handleClickFora(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverAberto(false);
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [popoverAberto]);

  function handlePeriodo(p: Periodo) {
    // Mantem a data de referencia (persistencia do periodo filtrado) - trocar
    // de mes/semana/dia deve continuar navegando dentro do mesmo mes/ano que
    // ja estava selecionado, nao voltar para hoje.
    setPeriodo(p);
  }

  function handlePeriodoAnterior() {
    setDataReferencia((d) => deslocar(d, periodo, -1));
  }

  function handlePeriodoProximo() {
    setDataReferencia((d) => deslocar(d, periodo, 1));
  }

  function handleAbrirPopover() {
    setMesSelecionado(dataReferencia.getMonth());
    setAnoSelecionado(dataReferencia.getFullYear());
    setPopoverAberto((v) => !v);
  }

  function handleAplicar() {
    setDataReferencia(new Date(anoSelecionado, mesSelecionado, 1));
    setPeriodo("mes");
    setPopoverAberto(false);
  }

  function handleMesAnterior() {
    setMesSelecionado((m) => (m === 0 ? 11 : m - 1));
  }

  function handleMesProximo() {
    setMesSelecionado((m) => (m === 11 ? 0 : m + 1));
  }

  function handleAnoAnterior() {
    setAnoSelecionado((a) => a - 1);
  }

  function handleAnoProximo() {
    setAnoSelecionado((a) => a + 1);
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex gap-1 rounded-[11px] border border-border-subtle bg-glass-strong p-1">
        {(["dia", "semana", "mes"] as Periodo[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodo(p)}
            className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${
              periodo === p ? "bg-accent-soft text-accent" : "text-text-secondary hover:bg-glass"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handlePeriodoAnterior}
          aria-label="Período anterior"
          className="flex h-6 w-6 items-center justify-center text-text-secondary transition hover:text-text-primary"
        >
          <CaretLeft size={13} weight="bold" />
        </button>

        <div className="relative" ref={popoverRef}>
          <button
            onClick={handleAbrirPopover}
            title="Selecionar outro mês e ano"
            className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold transition ${
              popoverAberto ? "text-accent" : "text-text-primary hover:text-accent"
            }`}
          >
            {formatarPeriodoLegivel(intervalo.data_inicio, intervalo.data_fim, periodo)}
          </button>

          {popoverAberto && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-10 w-[270px] rounded-2xl border border-border-subtle bg-glass-popover p-3 shadow-[var(--shadow-panel)] backdrop-blur-2xl">
              <p className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wide text-text-tertiary">
                Selecionar mês e ano
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleMesAnterior}
                  aria-label="Mês anterior"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary transition hover:text-text-primary"
                >
                  <CaretLeft size={12} weight="bold" />
                </button>
                <Dropdown className="min-w-0 flex-1" value={mesSelecionado} options={OPCOES_MES} onChange={setMesSelecionado} />
                <button
                  onClick={handleMesProximo}
                  aria-label="Próximo mês"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary transition hover:text-text-primary"
                >
                  <CaretRight size={12} weight="bold" />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={handleAnoAnterior}
                  aria-label="Ano anterior"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary transition hover:text-text-primary"
                >
                  <CaretLeft size={12} weight="bold" />
                </button>
                <Dropdown className="min-w-0 flex-1" value={anoSelecionado} options={opcoesAno(anoSelecionado)} onChange={setAnoSelecionado} />
                <button
                  onClick={handleAnoProximo}
                  aria-label="Próximo ano"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary transition hover:text-text-primary"
                >
                  <CaretRight size={12} weight="bold" />
                </button>
              </div>

              <button
                onClick={handleAplicar}
                className="mt-3 w-full rounded-[10px] bg-accent px-3 py-1.5 text-[12.5px] font-bold text-accent-contrast transition"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handlePeriodoProximo}
          aria-label="Próximo período"
          className="flex h-6 w-6 items-center justify-center text-text-secondary transition hover:text-text-primary"
        >
          <CaretRight size={13} weight="bold" />
        </button>
      </div>
    </div>
  );
}
