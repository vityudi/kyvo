import { useEffect, useState } from "react";
import { listarTransacoesDaFatura, type TransacaoFatura } from "../apiCartoes";
import { Modal } from "./Modal";

interface Props {
  faturaId: string;
  cartaoNome: string | null;
  onFechar: () => void;
}

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function FaturaTransacoesModal({ faturaId, cartaoNome, onFechar }: Props) {
  const [transacoes, setTransacoes] = useState<TransacaoFatura[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    listarTransacoesDaFatura(faturaId)
      .then((dados) => !cancelado && setTransacoes(dados))
      .catch((err) => !cancelado && setErro(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelado = true;
    };
  }, [faturaId]);

  const total = transacoes?.reduce((soma, t) => soma + t.valor, 0) ?? 0;

  return (
    <Modal titulo={cartaoNome ? `Fatura · ${cartaoNome}` : "Fatura"} onFechar={onFechar}>
      <div className="flex flex-col p-5">
        {erro && <p className="mb-3 text-[12.5px] text-danger">Falha ao carregar: {erro}</p>}

        {!transacoes && !erro && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[42px] animate-pulse rounded-[10px] bg-glass-strong" />
            ))}
          </div>
        )}

        {transacoes && transacoes.length === 0 && (
          <p className="py-6 text-center text-[13px] text-text-secondary">Nenhuma compra registrada ainda nesta fatura.</p>
        )}

        {transacoes && transacoes.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[14px] border border-border-subtle">
            {transacoes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-b border-border-subtle px-3.5 py-2.5 last:border-b-0">
                <span className="w-[92px] shrink-0 text-[12px] font-medium text-text-tertiary">{formatarData(t.data)}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
                  {t.descricao || t.categoria}
                </span>
                <span className="shrink-0 text-[13.5px] font-bold text-danger">{formatarValor(t.valor)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-text-tertiary">Total</span>
              <span className="text-[14px] font-bold text-text-primary">{formatarValor(total)}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
