import { useEffect, useState } from "react";
import { CaretDown, CreditCard, PencilSimple, Plus, Trash, Wallet } from "@phosphor-icons/react";
import { desativarCartao, listarCartoes, listarFaturasDoCartao, type Cartao, type Fatura } from "../apiCartoes";
import { listarContas, type Conta } from "../apiContas";
import { CartaoFormModal } from "./CartaoFormModal";
import { CartaoVisual } from "./CartaoVisual";
import { ContaFormModal } from "./ContaFormModal";

type Aba = "contas" | "cartoes";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROTULO_STATUS_FATURA: Record<Fatura["status"], string> = {
  aberta: "Em aberto",
  fechada: "Fechada",
  paga: "Paga",
};

const COR_STATUS_FATURA: Record<Fatura["status"], string> = {
  aberta: "bg-accent/10 text-accent",
  fechada: "bg-danger/10 text-danger",
  paga: "bg-success/10 text-success",
};

function ContaCard({ conta, onEditar }: { conta: Conta; onEditar: () => void }) {
  const negativo = conta.saldo < 0;
  return (
    <div className="rounded-[16px] border border-border-subtle p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          <Wallet size={17} />
        </div>
        <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-text-primary">{conta.nome}</p>
        <button
          onClick={onEditar}
          aria-label="Editar conta"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition hover:bg-glass hover:text-accent"
        >
          <PencilSimple size={14} />
        </button>
      </div>
      <div className="mt-3.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Saldo</p>
        <p className={`text-[26px] font-extrabold tracking-tight ${negativo ? "text-danger" : "text-text-primary"}`}>
          {formatarValor(conta.saldo)}
        </p>
      </div>
    </div>
  );
}

function CartaoCard({ cartao, onEditar, onDesativado }: { cartao: Cartao; onEditar: () => void; onDesativado: () => void }) {
  const [expandido, setExpandido] = useState(false);
  const [faturas, setFaturas] = useState<Fatura[] | null>(null);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);

  useEffect(() => {
    if (!expandido || faturas) return;
    listarFaturasDoCartao(cartao.id)
      .then(setFaturas)
      .catch(() => setFaturas([]));
  }, [expandido, faturas, cartao.id]);

  async function handleDesativar() {
    try {
      await desativarCartao(cartao.id);
      onDesativado();
    } finally {
      setConfirmandoDesativar(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-border-subtle p-3.5">
      <CartaoVisual nome={cartao.nome} banco={cartao.banco} diaFechamento={cartao.dia_fechamento} diaVencimento={cartao.dia_vencimento} />

      <div className="mt-3 flex items-center gap-1">
        <button
          onClick={() => setExpandido((v) => !v)}
          className="flex flex-1 items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-left text-[12px] font-semibold text-text-secondary transition hover:bg-glass-strong"
        >
          <CaretDown size={11} weight="bold" className={`transition ${expandido ? "rotate-180" : ""}`} />
          Faturas
        </button>
        <button
          onClick={onEditar}
          aria-label="Editar cartão"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition hover:bg-glass hover:text-accent"
        >
          <PencilSimple size={14} />
        </button>
        {confirmandoDesativar ? (
          <button onClick={handleDesativar} className="px-1 text-[11px] font-semibold text-danger">
            Confirmar?
          </button>
        ) : (
          <button
            onClick={() => setConfirmandoDesativar(true)}
            aria-label="Desativar cartão"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition hover:bg-glass hover:text-danger"
          >
            <Trash size={14} />
          </button>
        )}
      </div>

      {expandido && (
        <div className="mt-1 border-t border-border-subtle pt-2.5">
          {!faturas && <p className="text-[12px] text-text-tertiary">Carregando faturas...</p>}
          {faturas && faturas.length === 0 && <p className="text-[12px] text-text-tertiary">Nenhuma fatura ainda.</p>}
          {faturas && faturas.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {faturas.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-text-secondary">Vence {formatarData(f.data_vencimento)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${COR_STATUS_FATURA[f.status]}`}>
                    {ROTULO_STATUS_FATURA[f.status]}
                  </span>
                  <span className="ml-auto font-bold text-text-primary">{formatarValor(f.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContasCartoesView() {
  const [aba, setAba] = useState<Aba>("contas");
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalContaAberto, setModalContaAberto] = useState(false);
  const [editandoConta, setEditandoConta] = useState<Conta | null>(null);
  const [modalCartaoAberto, setModalCartaoAberto] = useState(false);
  const [editandoCartao, setEditandoCartao] = useState<Cartao | null>(null);
  const [recarregarSinal, setRecarregarSinal] = useState(0);

  useEffect(() => {
    let cancelado = false;
    listarContas()
      .then((dados) => !cancelado && setContas(dados))
      .catch((err) => !cancelado && setErro(err instanceof Error ? err.message : String(err)));
    listarCartoes()
      .then((dados) => !cancelado && setCartoes(dados))
      .catch((err) => !cancelado && setErro(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelado = true;
    };
  }, [recarregarSinal]);

  function handleSalvo() {
    setModalContaAberto(false);
    setEditandoConta(null);
    setModalCartaoAberto(false);
    setEditandoCartao(null);
    setRecarregarSinal((n) => n + 1);
  }

  const saldoTotal = contas?.reduce((soma, c) => soma + c.saldo, 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      {contas && contas.length > 0 && (
        <div className="shrink-0 border-b border-border-subtle px-5 pb-4 pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Saldo total</p>
          <p className={`text-[32px] font-extrabold tracking-tight ${saldoTotal < 0 ? "text-danger" : "text-text-primary"}`}>
            {formatarValor(saldoTotal)}
          </p>
        </div>
      )}

      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-5 pt-3">
        {(
          [
            ["contas", "Contas"],
            ["cartoes", "Cartões"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => setAba(valor)}
            className={`rounded-t-[10px] px-4 py-2.5 text-[13px] font-bold transition ${
              aba === valor
                ? "border-b-2 border-accent text-accent"
                : "border-b-2 border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[12.5px] text-text-secondary">
            {aba === "contas"
              ? "Contas bancárias onde suas transações são registradas."
              : "Cartões de crédito - compras neles se acumulam na fatura em aberto do ciclo corrente."}
          </p>
          <button
            onClick={() => (aba === "contas" ? setModalContaAberto(true) : setModalCartaoAberto(true))}
            className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-accent-contrast transition"
          >
            <Plus size={14} weight="bold" />
            {aba === "contas" ? "Nova conta" : "Novo cartão"}
          </button>
        </div>

        {erro && <p className="mb-3 text-[12.5px] text-danger">Falha ao carregar: {erro}</p>}

        {aba === "contas" && (
          <>
            {!contas && !erro && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-[104px] animate-pulse rounded-[16px] bg-glass-strong" />
                ))}
              </div>
            )}
            {contas && contas.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Wallet size={28} className="text-text-tertiary" />
                <p className="text-[13px] text-text-secondary">Nenhuma conta cadastrada.</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {contas?.map((c) => (
                <ContaCard
                  key={c.id}
                  conta={c}
                  onEditar={() => {
                    setEditandoConta(c);
                    setModalContaAberto(true);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {aba === "cartoes" && (
          <>
            {!cartoes && !erro && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1].map((i) => (
                  <div key={i} className="aspect-[1.586/1] animate-pulse rounded-[16px] bg-glass-strong" />
                ))}
              </div>
            )}
            {cartoes && cartoes.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <CreditCard size={28} className="text-text-tertiary" />
                <p className="text-[13px] text-text-secondary">Nenhum cartão cadastrado.</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cartoes?.map((c) => (
                <CartaoCard
                  key={c.id}
                  cartao={c}
                  onEditar={() => {
                    setEditandoCartao(c);
                    setModalCartaoAberto(true);
                  }}
                  onDesativado={() => setRecarregarSinal((n) => n + 1)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {modalContaAberto && (
        <ContaFormModal
          conta={editandoConta}
          onFechar={() => {
            setModalContaAberto(false);
            setEditandoConta(null);
          }}
          onSalvo={handleSalvo}
        />
      )}

      {modalCartaoAberto && (
        <CartaoFormModal
          cartao={editandoCartao}
          onFechar={() => {
            setModalCartaoAberto(false);
            setEditandoCartao(null);
          }}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
