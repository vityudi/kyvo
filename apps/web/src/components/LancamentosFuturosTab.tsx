import { useEffect, useMemo, useState } from "react";
import { Check, ClockCountdown, PencilSimple, Plus, Repeat, Trash, X } from "@phosphor-icons/react";
import {
  cancelarLancamentoFuturo,
  confirmarLancamentoFuturo,
  listarLancamentosFuturos,
  type LancamentoFuturo,
  type Recorrencia,
} from "../apiLancamentosFuturos";
import { corCategoria, corTextoBadgeCategoria } from "../lib/categoriaCores";
import { rotuloMesAno } from "../lib/tempo";
import { useTheme } from "../lib/theme";
import { LancamentoFuturoFormModal } from "./LancamentoFuturoFormModal";

const MESES_PROJECAO = 3;
const DIAS_ATRASO_VISIVEL = 3;

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function paraIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hojeIso(): string {
  return paraIso(new Date());
}

/** Data de corte: itens atrasados antes disso saem da lista (ainda ficam pendentes no banco, só não aparecem mais aqui). */
function corteAtrasoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_ATRASO_VISIVEL);
  return paraIso(d);
}

function proximaOcorrencia(d: Date, recorrencia: Recorrencia): Date {
  const proxima = new Date(d);
  if (recorrencia === "diaria") proxima.setDate(proxima.getDate() + 1);
  else if (recorrencia === "semanal") proxima.setDate(proxima.getDate() + 7);
  else if (recorrencia === "mensal") proxima.setMonth(proxima.getMonth() + 1);
  else proxima.setFullYear(proxima.getFullYear() + 1);
  return proxima;
}

const ROTULO_RECORRENCIA: Record<string, string> = {
  diaria: "todo dia",
  semanal: "toda semana",
  mensal: "todo mês",
  anual: "todo ano",
};

interface ItemLancamento extends LancamentoFuturo {
  /** Chave unica por ocorrencia (o `id` do lancamento se repete nas projecoes). */
  chave: string;
  /** true = ocorrencia futura projetada de um lancamento recorrente, so pra visualizacao - nao existe linha propria no banco ainda, so aparece de fato quando a atual for confirmada e uma nova for criada. */
  projetado: boolean;
}

/**
 * Expande lancamentos recorrentes em ocorrencias futuras (so client-side, pra
 * preview) - o banco guarda so a proxima ocorrencia real (ver
 * db/lancamentoFuturo.ts), mas o usuario quer ver o aluguel/assinatura
 * aparecendo tambem nos meses seguintes na lista. Limitado a `MESES_PROJECAO`
 * meses pra frente pra nao gerar uma lista infinita.
 */
function expandirOcorrencias(lancamentos: LancamentoFuturo[]): ItemLancamento[] {
  const limite = new Date();
  limite.setMonth(limite.getMonth() + MESES_PROJECAO);

  const itens: ItemLancamento[] = [];
  for (const l of lancamentos) {
    itens.push({ ...l, chave: l.id, projetado: false });
    if (!l.recorrencia) continue;

    let proxima = proximaOcorrencia(new Date(`${l.data_prevista.slice(0, 10)}T00:00:00`), l.recorrencia);
    while (proxima <= limite) {
      const iso = paraIso(proxima);
      itens.push({ ...l, data_prevista: iso, chave: `${l.id}-${iso}`, projetado: true });
      proxima = proximaOcorrencia(proxima, l.recorrencia);
    }
  }
  return itens.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
}

export function LancamentosFuturosTab() {
  const { escuro } = useTheme();
  const corTextoBadge = corTextoBadgeCategoria(escuro);
  const [lancamentos, setLancamentos] = useState<LancamentoFuturo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<LancamentoFuturo | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [recarregarSinal, setRecarregarSinal] = useState(0);
  const hoje = hojeIso();

  const gruposPorMes = useMemo(() => {
    if (!lancamentos) return null;
    const corte = corteAtrasoIso();
    const itens = expandirOcorrencias(lancamentos).filter((item) => item.data_prevista.slice(0, 10) >= corte);
    const mapa = new Map<string, ItemLancamento[]>();
    for (const item of itens) {
      const chaveMes = item.data_prevista.slice(0, 7);
      if (!mapa.has(chaveMes)) mapa.set(chaveMes, []);
      mapa.get(chaveMes)!.push(item);
    }
    return Array.from(mapa.entries());
  }, [lancamentos]);

  useEffect(() => {
    let cancelado = false;
    listarLancamentosFuturos({ status: "pendente" })
      .then((dados) => {
        if (!cancelado) setLancamentos(dados);
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelado = true;
    };
  }, [recarregarSinal]);

  function handleSalvo() {
    setModalAberto(false);
    setEditando(null);
    setRecarregarSinal((n) => n + 1);
  }

  async function handleConfirmar(id: string) {
    setProcessandoId(id);
    try {
      await confirmarLancamentoFuturo(id);
      // Recarrega em vez de so filtrar localmente: se for recorrente, o
      // backend ja cria a proxima ocorrencia pendente, e ela precisa entrar
      // na lista (nao existia no estado local antes).
      setRecarregarSinal((n) => n + 1);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessandoId(null);
    }
  }

  async function handleCancelar(id: string) {
    setProcessandoId(id);
    try {
      await cancelarLancamentoFuturo(id);
      setLancamentos((atual) => atual?.filter((l) => l.id !== id) ?? atual);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessandoId(null);
      setConfirmandoId(null);
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[12.5px] text-text-secondary">
          Despesas e receitas planejadas que ainda não aconteceram. Confirme quando forem pagas/recebidas de fato.
        </p>
        <button
          onClick={() => {
            setEditando(null);
            setModalAberto(true);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-accent-contrast transition"
        >
          <Plus size={14} weight="bold" />
          Novo lançamento futuro
        </button>
      </div>

      {erro && <p className="mb-3 text-[12.5px] text-danger">Falha ao carregar: {erro}</p>}

      {!lancamentos && !erro && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-[10px] bg-glass-strong" />
          ))}
        </div>
      )}

      {gruposPorMes && gruposPorMes.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ClockCountdown size={28} className="text-text-tertiary" />
          <p className="text-[13px] text-text-secondary">Nenhum lançamento futuro planejado.</p>
          <p className="max-w-[320px] text-[12px] text-text-tertiary">
            Peça pro assistente ("me lembra que tenho que pagar o aluguel dia 10") ou crie manualmente aqui.
          </p>
        </div>
      )}

      {gruposPorMes && gruposPorMes.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border border-border-subtle">
          {gruposPorMes?.map(([chaveMes, itens]) => (
            <div key={chaveMes}>
              <p className="px-4 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
                {rotuloMesAno(itens[0]!.data_prevista)}
              </p>
              {itens.map((l) => {
                const confirmando = confirmandoId === l.chave;
                const processando = processandoId === l.id;
                const cor = l.tipo === "despesa" ? "text-danger" : "text-success";
                const sinal = l.tipo === "despesa" ? "−" : "+";
                const atrasado = !l.projetado && l.data_prevista.slice(0, 10) < hoje;
                return (
                  <div
                    key={l.chave}
                    className={`group/row flex items-center gap-4 border-b border-border-subtle px-4 py-3.5 last:border-b-0 hover:bg-glass-strong ${
                      l.projetado ? "opacity-55" : ""
                    }`}
                  >
                    <span
                      className={`w-[92px] shrink-0 rounded-full px-3 py-1 text-center text-[11.5px] font-bold ${
                        l.tipo === "despesa" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                      }`}
                    >
                      {l.tipo === "despesa" ? "Despesa" : "Receita"}
                    </span>
                    <span className={`w-[128px] shrink-0 text-[15px] font-bold ${cor}`}>
                      {sinal} {formatarValor(l.valor)}
                    </span>
                    <span
                      className={`flex w-[128px] shrink-0 items-center gap-1 text-[13px] font-medium ${
                        atrasado ? "text-danger" : "text-text-tertiary"
                      }`}
                    >
                      {formatarData(l.data_prevista)}
                      {l.recorrencia && (
                        <span
                          title={`${ROTULO_RECORRENCIA[l.recorrencia]}${
                            l.repeticoes_restantes != null ? ` — restam ${l.repeticoes_restantes}` : ""
                          }`}
                        >
                          <Repeat size={12} className={l.projetado ? "text-text-tertiary" : "text-accent"} />
                        </span>
                      )}
                    </span>
                    <span
                      style={{ backgroundColor: corCategoria(l.categoria), color: corTextoBadge }}
                      className="w-[140px] shrink-0 truncate rounded-full px-3 py-1 text-center text-[11.5px] font-bold uppercase tracking-wide"
                    >
                      {l.categoria}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">
                      {l.descricao || <span className="text-text-tertiary">—</span>}
                    </span>

                    <span className="flex shrink-0 w-[124px] items-center justify-end gap-1">
                      {l.projetado ? (
                        <span className="text-[11px] font-semibold text-text-tertiary">Próxima ocorrência</span>
                      ) : confirmando ? (
                        <>
                          <span className="mr-1 text-[11.5px] font-semibold text-text-secondary">Cancelar?</span>
                          <button
                            onClick={() => handleCancelar(l.id)}
                            disabled={processando}
                            aria-label="Confirmar cancelamento"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-danger transition hover:bg-glass"
                          >
                            <Check size={14} weight="bold" />
                          </button>
                          <button
                            onClick={() => setConfirmandoId(null)}
                            aria-label="Voltar"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-glass"
                          >
                            <X size={14} weight="bold" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleConfirmar(l.id)}
                            disabled={processando}
                            aria-label="Confirmar - já foi pago/recebido"
                            title="Já foi pago/recebido"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition hover:bg-success/10 hover:text-success"
                          >
                            <Check size={14} weight="bold" />
                          </button>
                          <button
                            onClick={() => {
                              setEditando(l);
                              setModalAberto(true);
                            }}
                            aria-label="Editar"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary opacity-0 transition hover:bg-glass hover:text-accent group-hover/row:opacity-100"
                          >
                            <PencilSimple size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmandoId(l.chave)}
                            aria-label="Cancelar"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary opacity-0 transition hover:bg-glass hover:text-danger group-hover/row:opacity-100"
                          >
                            <Trash size={14} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <LancamentoFuturoFormModal
          lancamento={editando}
          onFechar={() => {
            setModalAberto(false);
            setEditando(null);
          }}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
