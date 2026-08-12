import { WifiHigh } from "@phosphor-icons/react";
import { bancoPorChave } from "../lib/bancos";

interface Props {
  nome: string;
  banco: string | null;
  diaFechamento: number;
  diaVencimento: number;
  className?: string;
}

/** Cartao de credito estilizado com a cor de marca do banco (ver lib/bancos.ts) - so decorativo, imita o visual de apps bancarios pra dar mais imersao ao painel. */
export function CartaoVisual({ nome, banco, diaFechamento, diaVencimento, className }: Props) {
  const b = bancoPorChave(banco);

  return (
    <div
      style={{ background: `linear-gradient(135deg, ${b.gradiente[0]}, ${b.gradiente[1]})`, color: b.corTexto }}
      className={`relative flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-[16px] p-4 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] ${className ?? ""}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, white, transparent 70%)" }}
      />

      <div className="flex items-start justify-between">
        <div className="h-6 w-8 rounded-[5px] bg-white/25" />
        <WifiHigh size={18} weight="bold" className="rotate-90 opacity-80" />
      </div>

      <div>
        <p className="text-[15px] font-mono font-bold tracking-[0.18em] opacity-90">•••• •••• •••• ••••</p>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">{nome}</p>
          <p className="text-[10.5px] font-medium opacity-75">
            Fecha {diaFechamento} · Vence {diaVencimento}
          </p>
        </div>
        <p className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide opacity-80">{b.label}</p>
      </div>
    </div>
  );
}
