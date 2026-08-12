import { useEffect, useMemo, useState } from "react";

const CHAVE_ARMAZENAMENTO = "kyvo-tema-escuro";

function preferenciaInicial(): boolean {
  const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
  if (salvo !== null) return salvo === "1";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [escuro, setEscuro] = useState(preferenciaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    localStorage.setItem(CHAVE_ARMAZENAMENTO, escuro ? "1" : "0");
  }, [escuro]);

  return { escuro, alternarTema: () => setEscuro((v) => !v) };
}

function corVar(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/**
 * Cores concretas (nao classes Tailwind) para alimentar props de stroke/fill
 * do recharts - recalculadas quando o tema claro/escuro muda, ja que
 * styles.css redefine as CSS vars em `:root.dark`.
 */
export function useChartColors(escuro: boolean) {
  return useMemo(
    () => ({
      despesa: corVar("--danger"),
      receita: corVar("--success"),
      accent: corVar("--accent"),
      grid: corVar("--border-subtle"),
      texto: corVar("--text-secondary"),
    }),
    [escuro],
  );
}
