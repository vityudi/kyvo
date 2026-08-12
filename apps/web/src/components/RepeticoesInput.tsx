import { Minus, Plus } from "@phosphor-icons/react";

interface Props {
  /** 0 = "Sempre" (repete indefinidamente), 1-99 = numero de vezes. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function limitar(v: number): number {
  return Math.max(0, Math.min(99, v));
}

/** Seletor "quantas vezes repete": stepper numérico livre até 99 (0 = "Sempre"). */
export function RepeticoesInput({ value, onChange, disabled }: Props) {
  function handleDigitar(texto: string) {
    const digitos = texto.replace(/\D/g, "").slice(0, 2);
    onChange(digitos === "" ? 0 : limitar(Number(digitos)));
  }

  return (
    <div className="flex w-full items-center gap-1 rounded-[10px] border border-border-subtle bg-input-bg px-1.5 py-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(limitar(value - 1))}
        aria-label="Diminuir"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-glass disabled:opacity-40"
      >
        <Minus size={12} weight="bold" />
      </button>
      <input
        value={value === 0 ? "Sempre" : `${value}x`}
        onChange={(e) => handleDigitar(e.target.value)}
        disabled={disabled}
        inputMode="numeric"
        aria-label="Número de repetições (0 = sempre)"
        className="min-w-0 flex-1 bg-transparent text-center text-[13.5px] text-text-primary focus:outline-none disabled:opacity-40"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(limitar(value + 1))}
        aria-label="Aumentar"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-glass disabled:opacity-40"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}
