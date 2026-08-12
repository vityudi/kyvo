import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

interface Posicao {
  top: number;
  left: number;
  width: number;
}

/**
 * Dropdown com estilo proprio do app (mesmo visual do seletor de provedor no
 * TopBar), no lugar do <select> nativo do navegador. O menu e renderizado via
 * portal em document.body com posicionamento fixed calculado a partir do
 * botao - assim ele flutua por cima de qualquer container com overflow
 * (ex.: o body rolavel de um Modal) em vez de ficar clipado/forcando scroll.
 */
export function Dropdown<T extends string | number>({ value, options, onChange, className }: Props<T>) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<Posicao>({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function atualizarPosicao() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 150) });
  }

  useEffect(() => {
    if (!aberto) return;
    atualizarPosicao();

    function handleClickFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || menuRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", handleClickFora);
    window.addEventListener("scroll", atualizarPosicao, true);
    window.addEventListener("resize", atualizarPosicao);
    return () => {
      document.removeEventListener("mousedown", handleClickFora);
      window.removeEventListener("scroll", atualizarPosicao, true);
      window.removeEventListener("resize", atualizarPosicao);
    };
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

      {aberto &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: posicao.top, left: posicao.left, width: posicao.width }}
            className="z-[100] max-h-[260px] overflow-y-auto rounded-2xl border border-border-subtle bg-glass-popover p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-2xl"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
