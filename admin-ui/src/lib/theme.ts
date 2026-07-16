import { useEffect, useState } from "react";

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
