import { useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (valor: T) => void;
  className?: string;
}

/** Dropdown com estilo proprio do app (mesmo visual do seletor de provedor no TopBar), no lugar do <select> nativo do navegador. */
export function Dropdown<T extends string | number>({ value, options, onChange, className }: Props<T>) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [aberto]);

  const selecionado = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex w-full items-center gap-1.5 rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[12.5px] font-semibold text-text-primary transition hover:bg-glass-strong ${
          aberto ? "border-accent/40" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selecionado?.label ?? ""}</span>
        <CaretDown size={11} weight="bold" className="shrink-0 text-text-tertiary" />
      </button>

      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-[260px] w-full min-w-[150px] overflow-y-auto rounded-2xl border border-border-subtle bg-glass-popover p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-2xl">
          {options.map((o) => {
            const ativo = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setAberto(false);
                }}
                className={`flex w-full items-center rounded-[9px] px-2.5 py-1.5 text-left text-[12.5px] transition ${
                  ativo ? "bg-accent-soft font-bold text-text-primary" : "font-medium text-text-primary hover:bg-glass"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
