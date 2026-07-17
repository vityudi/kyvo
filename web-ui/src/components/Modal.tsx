import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

interface Props {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}

export function Modal({ titulo, onFechar, children }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar}
      role="presentation"
    >
      <div
        className="glass-panel flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-glass-border bg-glass-strong"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-bold text-text-primary">{titulo}</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-glass"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
