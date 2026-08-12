import { useEffect, useMemo, useState } from "react";
import { Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { excluirTransacao, listarTransacoes, type Transacao, type TipoTransacao } from "../apiFinancas";
import { bancoPorChave } from "../lib/bancos";
import { corCategoria, corTextoBadgeCategoria } from "../lib/categoriaCores";
import { pollingVisivel } from "../lib/pollingVisivel";
import { formatarHorario, rotuloMesAno, type IntervaloData } from "../lib/tempo";
import { useTheme } from "../lib/theme";
import { LancamentosFuturosTab } from "./LancamentosFuturosTab";
import { SeletorPeriodo, type Periodo } from "./SeletorPeriodo";
import { TransacaoFormModal } from "./TransacaoFormModal";

type AbaTransacoes = "extrato" | "futuros";

const LIMITE_PAGINA = 30;
// "Sem limite inferior" pro modo extrato (periodo "dia" = "Hoje") - mostra da
// data de referencia pra tras, sem cortar historico antigo.
const DATA_INICIO_SEM_LIMITE = "1900-01-01";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatarData(iso: string): string {
  // `data` vem do backend como timestamp completo (coluna `date` do Postgres
  // serializada como Date pelo driver `pg`) - pegar so os 10 primeiros
  // caracteres evita depender do fuso do navegador na conversao.
  const dataPura = iso.slice(0, 10);
  return new Date(`${dataPura}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface ResumoCategoria {
  categoria: string;
  totalDespesas: number;
  totalReceitas: number;
}

export function TransacoesView() {
  const { escuro } = useTheme();
  const corTextoBadge = corTextoBadgeCategoria(escuro);
  const [aba, setAba] = useState<AbaTransacoes>("extrato");
  const [periodoAtivo, setPeriodoAtivo] = useState<Periodo>("dia");
  const [intervalo, setIntervalo] = useState<IntervaloData | null>(null);
  const [tipo, setTipo] = useState<TipoTransacao | "todos">("todos");
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());
  const [transacoes, setTransacoes] = useState<Transacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Transacao | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [recarregarSinal, setRecarregarSinal] = useState(0);
  const [reiniciarSinal, setReiniciarSinal] = useState(0);

  function handleIntervaloChange(periodo: Periodo, novoIntervalo: IntervaloData) {
    setPeriodoAtivo(periodo);
    setIntervalo(novoIntervalo);
  }

  // No modo "dia" parado em "Hoje" (nao navegado pelas setas), o filtro vira
  // um extrato: da data atual pra tras, sem limite inferior. Ao navegar pra
  // outro dia com as setas < >, volta a ser um filtro literal daquele dia
  // isolado - so "Hoje" continua sendo o extrato completo.
  const intervaloEfetivo = useMemo<IntervaloData | null>(() => {
    if (!intervalo) return null;
    if (periodoAtivo === "dia" && intervalo.data_fim === hojeIso()) {
      return { data_inicio: DATA_INICIO_SEM_LIMITE, data_fim: intervalo.data_fim };
    }
    return intervalo;
  }, [intervalo, periodoAtivo]);

  // Algum filtro fora do estado inicial ("Hoje", todos os tipos, sem
  // categoria selecionada) - controla a visibilidade do botao Limpar.
  const filtroAtivo =
    tipo !== "todos" ||
    categoriasSelecionadas.size > 0 ||
    periodoAtivo !== "dia" ||
    (periodoAtivo === "dia" && intervalo !== null && intervalo.data_fim !== hojeIso());

  useEffect(() => {
    if (!intervaloEfetivo) return;
    let cancelado = false;
    const { data_inicio, data_fim } = intervaloEfetivo;

    async function carregar() {
      try {
        const pagina = await listarTransacoes({
          data_inicio,
          data_fim,
          tipo: tipo === "todos" ? undefined : tipo,
          limite: LIMITE_PAGINA,
          offset: 0,
        });
        if (cancelado) return;
        setTransacoes(pagina);
        setTemMais(pagina.length === LIMITE_PAGINA);
        setOffset(0);
        setErro(null);
      } catch (err) {
        if (!cancelado) setErro(err instanceof Error ? err.message : String(err));
      }
    }

    carregar();
    const pararPolling = pollingVisivel(carregar, 10_000);
    return () => {
      cancelado = true;
      pararPolling();
    };
  }, [intervaloEfetivo, tipo, recarregarSinal]);

  async function handleCarregarMais() {
    if (!intervaloEfetivo) return;
    const novoOffset = offset + LIMITE_PAGINA;
    try {
      const pagina = await listarTransacoes({
        data_inicio: intervaloEfetivo.data_inicio,
        data_fim: intervaloEfetivo.data_fim,
        tipo: tipo === "todos" ? undefined : tipo,
        limite: LIMITE_PAGINA,
        offset: novoOffset,
      });
      setTransacoes((atual) => (atual ? [...atual, ...pagina] : pagina));
      setTemMais(pagina.length === LIMITE_PAGINA);
      setOffset(novoOffset);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExcluir(id: string) {
    try {
      await excluirTransacao(id);
      setTransacoes((atual) => atual?.filter((t) => t.id !== id) ?? atual);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmandoId(null);
    }
  }

  function handleSalvo() {
    setModalAberto(false);
    setEditando(null);
    setRecarregarSinal((n) => n + 1);
  }

  function handleLimpar() {
    setTipo("todos");
    setCategoriasSelecionadas(new Set());
    setReiniciarSinal((n) => n + 1);
  }

  function toggleCategoria(categoria: string) {
    setCategoriasSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  function removerCategoria(categoria: string) {
    setCategoriasSelecionadas((atual) => {
      const novo = new Set(atual);
      novo.delete(categoria);
      return novo;
    });
  }

  // Resumo por categoria da propria lista carregada (respeita periodo/tipo ja
  // aplicados na consulta) - fica de fora da selecao de categorias para o
  // usuario continuar podendo somar/remover outras categorias ao filtro.
  const resumoPorCategoria = useMemo<ResumoCategoria[]>(() => {
    if (!transacoes) return [];
    const mapa = new Map<string, ResumoCategoria>();
    for (const t of transacoes) {
      const atual = mapa.get(t.categoria) ?? { categoria: t.categoria, totalDespesas: 0, totalReceitas: 0 };
      if (t.tipo === "despesa") atual.totalDespesas += t.valor;
      else atual.totalReceitas += t.valor;
      mapa.set(t.categoria, atual);
    }
    return Array.from(mapa.values()).sort(
      (a, b) => b.totalDespesas + b.totalReceitas - (a.totalDespesas + a.totalReceitas),
    );
  }, [transacoes]);

  // Sem nenhuma categoria selecionada mostra tudo - com uma ou mais, soma
  // (OR) as categorias marcadas, nao intersecciona.
  const transacoesFiltradas = useMemo(() => {
    if (!transacoes) return null;
    if (categoriasSelecionadas.size === 0) return transacoes;
    return transacoes.filter((t) => categoriasSelecionadas.has(t.categoria));
  }, [transacoes, categoriasSelecionadas]);

  // Agrupa por mes sempre (estilo extrato bancario) - mesmo period filtros
  // como "semana" podem cruzar dois meses (ex.: 27/jul a 02/ago), entao o
  // cabecalho do mes deve aparecer nesses casos tambem, nao so no modo "dia".
  // A lista ja vem ordenada por data desc do backend, entao um Map preserva
  // a ordem certa dos grupos.
  const gruposPorMes = useMemo(() => {
    if (!transacoesFiltradas) return null;
    const mapa = new Map<string, Transacao[]>();
    for (const t of transacoesFiltradas) {
      const chave = t.data.slice(0, 7);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(t);
    }
    return Array.from(mapa.entries());
  }, [transacoesFiltradas]);

  function renderLinha(t: Transacao) {
    const confirmando = confirmandoId === t.id;
    const cor = t.tipo === "despesa" ? "text-danger" : "text-success";
    const sinal = t.tipo === "despesa" ? "−" : "+";
    return (
      <div
        key={t.id}
        className="group/row flex items-center gap-4 border-b border-border-subtle px-4 py-3.5 last:border-b-0 hover:bg-glass-strong"
      >
        <span
          className={`w-[92px] shrink-0 rounded-full px-3 py-1 text-center text-[11.5px] font-bold ${
            t.tipo === "despesa" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
          }`}
        >
          {t.tipo === "despesa" ? "Despesa" : "Receita"}
        </span>
        <span className={`w-[128px] shrink-0 text-[15px] font-bold ${cor}`}>
          {sinal} {formatarValor(t.valor)}
        </span>
        <span className="w-[128px] shrink-0 text-[13px] font-medium text-text-tertiary">
          {formatarData(t.data)} <span className="text-text-tertiary/70">· {formatarHorario(t.data_hora)}</span>
        </span>
        <span
          style={{ backgroundColor: corCategoria(t.categoria), color: corTextoBadge }}
          className="w-[140px] shrink-0 truncate rounded-full px-3 py-1 text-center text-[11.5px] font-bold uppercase tracking-wide"
        >
          {t.categoria}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">
          {t.descricao || <span className="text-text-tertiary">—</span>}
          {t.cartao_nome &&
            (() => {
              const banco = bancoPorChave(t.cartao_banco);
              return (
                <span
                  style={{ background: `linear-gradient(135deg, ${banco.gradiente[0]}, ${banco.gradiente[1]})`, color: banco.corTexto }}
                  className="ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                >
                  Crédito · {t.cartao_nome}
                </span>
              );
            })()}
        </span>

        <span className="flex shrink-0 items-center gap-1">
          {confirmando ? (
            <>
              <button
                onClick={() => handleExcluir(t.id)}
                aria-label="Confirmar exclusão"
                className="flex h-7 w-7 items-center justify-center rounded-md text-danger transition hover:bg-glass"
              >
                <Check size={14} weight="bold" />
              </button>
              <button
                onClick={() => setConfirmandoId(null)}
                aria-label="Cancelar exclusão"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-glass"
              >
                <X size={14} weight="bold" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditando(t);
                  setModalAberto(true);
                }}
                aria-label="Editar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary opacity-0 transition hover:bg-glass hover:text-accent group-hover/row:opacity-100"
              >
                <PencilSimple size={14} />
              </button>
              <button
                onClick={() => setConfirmandoId(t.id)}
                aria-label="Excluir"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary opacity-0 transition hover:bg-glass hover:text-danger group-hover/row:opacity-100"
              >
                <Trash size={14} />
              </button>
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-5 pt-4">
        {(
          [
            ["extrato", "Extrato"],
            ["futuros", "Lançamentos futuros"],
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

      {aba === "futuros" ? (
        <LancamentosFuturosTab />
      ) : (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <SeletorPeriodo periodoInicial="dia" reiniciarSinal={reiniciarSinal} onChange={handleIntervaloChange} />

        <div className="flex gap-1 rounded-[11px] border border-border-subtle bg-glass-strong p-1">
          {(["todos", "despesa", "receita"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${
                tipo === t ? "bg-accent-soft text-accent" : "text-text-secondary hover:bg-glass"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {filtroAtivo && (
          <button onClick={handleLimpar} className="text-[12.5px] font-semibold text-accent transition hover:underline">
            Limpar
          </button>
        )}

        <button
          onClick={() => {
            setEditando(null);
            setModalAberto(true);
          }}
          className="ml-auto flex items-center gap-1.5 rounded-[11px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-accent-contrast transition"
        >
          <Plus size={14} weight="bold" />
          Nova transação
        </button>
      </div>

      {erro && <p className="mb-3 text-[12.5px] text-danger">Falha ao carregar: {erro}</p>}

      {!transacoes && !erro && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-[10px] bg-glass-strong" />
          ))}
        </div>
      )}

      {transacoes && transacoes.length === 0 && (
        <p className="py-10 text-center text-[13px] text-text-secondary">Nenhuma transação registrada ainda.</p>
      )}

      {transacoes && transacoes.length > 0 && (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-[2] flex-col overflow-y-auto rounded-[14px] border border-border-subtle">
            {transacoesFiltradas && transacoesFiltradas.length === 0 && (
              <p className="py-10 text-center text-[13px] text-text-secondary">
                Nenhuma transação nas categorias selecionadas.
              </p>
            )}

            {gruposPorMes?.map(([chave, itens]) => (
              <div key={chave}>
                <p className="px-4 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
                  {rotuloMesAno(itens[0]!.data)}
                </p>
                {itens.map(renderLinha)}
              </div>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-glass-strong">
            <div className="shrink-0 border-b border-border-subtle px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-text-tertiary">Por categoria</p>
                {categoriasSelecionadas.size > 0 && (
                  <button
                    onClick={() => setCategoriasSelecionadas(new Set())}
                    className="text-[11.5px] font-semibold text-accent transition hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {categoriasSelecionadas.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from(categoriasSelecionadas).map((c) => (
                    <span
                      key={c}
                      style={{ backgroundColor: corCategoria(c), color: corTextoBadge }}
                      className="flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-[11px] font-bold uppercase tracking-wide"
                    >
                      {c}
                      <button
                        onClick={() => removerCategoria(c)}
                        aria-label={`Remover filtro ${c}`}
                        className="flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-black/15"
                      >
                        <X size={9} weight="bold" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {resumoPorCategoria.map((r) => {
                const ativo = categoriasSelecionadas.has(r.categoria);
                const cor = corCategoria(r.categoria);
                return (
                  <button
                    key={r.categoria}
                    onClick={() => toggleCategoria(r.categoria)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2.5 text-left transition ${
                      ativo ? "bg-accent-soft" : "hover:bg-glass"
                    }`}
                  >
                    <span
                      style={{
                        backgroundColor: cor,
                        color: corTextoBadge,
                        boxShadow: ativo ? "0 0 0 2px var(--accent)" : undefined,
                      }}
                      className="min-w-0 shrink truncate rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                    >
                      {r.categoria}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold">
                      {r.totalDespesas > 0 && <span className="text-danger">− {formatarValor(r.totalDespesas)}</span>}
                      {r.totalReceitas > 0 && <span className="text-success">+ {formatarValor(r.totalReceitas)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {temMais && (
        <button
          onClick={handleCarregarMais}
          className="mt-3 self-center rounded-[10px] border border-border-subtle px-4 py-2 text-[12.5px] font-semibold text-text-secondary transition hover:bg-glass-strong"
        >
          Carregar mais
        </button>
      )}

      {modalAberto && (
        <TransacaoFormModal
          transacao={editando}
          onFechar={() => {
            setModalAberto(false);
            setEditando(null);
          }}
          onSalvo={handleSalvo}
        />
      )}
    </div>
      )}
    </div>
  );
}
