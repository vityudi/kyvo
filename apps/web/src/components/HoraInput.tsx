import { useState } from "react";

interface Props {
  /** Horário em formato "HH:mm". */
  value: string;
  onChange: (value: string) => void;
}

function mascarar(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

function normalizar(valor: string): string {
  const [h, m] = valor.split(":");
  const hora = Math.min(23, Number(h) || 0);
  const minuto = Math.min(59, Number(m) || 0);
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/**
 * Campo de horário minimalista: texto mascarado "HH:mm" com o mesmo visual
 * dos outros inputs do formulário, no lugar do <input type="time"> genérico
 * do navegador (inconsistente entre OS/browsers) ou de dropdowns (que
 * quebram o layout em modais estreitos). Valida/normaliza só ao sair do
 * campo, não a cada tecla, pra não interromper a digitação.
 */
export function HoraInput({ value, onChange }: Props) {
  const [digitando, setDigitando] = useState<string | null>(null);

  return (
    <input
      value={digitando ?? value}
      onChange={(e) => setDigitando(mascarar(e.target.value))}
      onBlur={() => {
        if (digitando !== null) onChange(normalizar(digitando));
        setDigitando(null);
      }}
      inputMode="numeric"
      placeholder="09:00"
      maxLength={5}
      className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-center text-[13.5px] text-text-primary focus:outline-none"
    />
  );
}
