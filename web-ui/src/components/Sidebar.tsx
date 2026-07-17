import { useEffect, useMemo, useState } from "react";
import { Check, ChatCircle, GearSix, MagnifyingGlass, PencilSimpleLine, SidebarSimple, Trash, X } from "@phosphor-icons/react";
import { deletarConversa, listarConversas, type ConversaResumo } from "../api";
import { formatarTempoRelativo, rotuloGrupoData } from "../lib/tempo";

interface Props {
  conversaSelecionadaId: string | null;
  onSelecionar: (conversa: ConversaResumo) => void;
  atualizarSinal: number;
  onNovaConversa: () => void;
  onAbrirConfig: () => void;
  onFechar: () => void;
  onConversaDeletada: (conversaId: string) => void;
}

/**
 * Sidebar unica (logo + nova conversa + busca + lista + configuracoes),
 * no formato do OpenWebUI: uma coluna so, colapsavel, com a lista de chats
 * agrupada por data e um rodape fixo para acoes globais.
 */
export function Sidebar({
  conversaSelecionadaId,
  onSelecionar,
  atualizarSinal,
  onNovaConversa,
  onAbrirConfig,
  onFechar,
  onConversaDeletada,
}: Props) {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const lista = await listarConversas();
        if (!cancelado) {
          setConversas(lista);
          setErro(null);
        }
      } catch (err) {
        if (!cancelado) setErro(err instanceof Error ? err.message : String(err));
      }
    }

    carregar();
    const intervalo = setInterval(carregar, 10_000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [atualizarSinal]);

  const filtradas = useMemo(() => {
    if (!conversas) return null;
    const termo = busca.trim().toLowerCase();
    if (!termo) return conversas;
    return conversas.filter((c) => String(c.telegramChatId).includes(termo));
  }, [conversas, busca]);

  async function handleApagar(conversaId: string) {
    setApagandoId(conversaId);
    try {
      await deletarConversa(conversaId);
      setConversas((atual) => atual?.filter((c) => c.id !== conversaId) ?? atual);
      onConversaDeletada(conversaId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setApagandoId(null);
      setConfirmandoId(null);
    }
  }

  const grupos = useMemo(() => {
    if (!filtradas) return null;
    const mapa = new Map<string, ConversaResumo[]>();
    for (const c of filtradas) {
      const rotulo = rotuloGrupoData(c.ultimaEm);
      if (!mapa.has(rotulo)) mapa.set(rotulo, []);
      mapa.get(rotulo)!.push(c);
    }
    return mapa;
  }, [filtradas]);

  return (
    <div className="flex h-full w-full shrink-0 flex-col">
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent to-accent-deep text-[13px] font-extrabold text-accent-contrast shadow-[0_6px_14px_-6px_var(--accent-soft)]">
          K
        </div>
        <span className="flex-1 truncate text-sm font-bold tracking-tight text-text-primary">Kyvo</span>
        <button
          onClick={onFechar}
          aria-label="Recolher barra lateral"
          title="Recolher barra lateral"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-text-secondary transition hover:bg-glass-strong"
        >
          <SidebarSimple size={16} />
        </button>
      </div>

      <div className="px-2.5 pb-2 pt-0.5">
        <button
          onClick={onNovaConversa}
          className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-text-primary transition hover:bg-glass-strong"
        >
          <PencilSimpleLine size={16} />
          Nova conversa
        </button>

        <div className="relative mt-0.5">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por chat id"
            className="w-full rounded-[10px] border border-border-subtle bg-input-bg py-[7px] pl-[30px] pr-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {erro && <p className="px-2 py-3 text-sm text-danger">Falha ao carregar: {erro}</p>}

        {!conversas && !erro && (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-glass-strong" />
            ))}
          </div>
        )}

        {filtradas && filtradas.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <ChatCircle size={26} className="text-text-tertiary" />
            <p className="text-[12.5px] text-text-secondary">
              {busca ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
            </p>
          </div>
        )}

        {grupos &&
          Array.from(grupos.entries()).map(([rotulo, itens]) => (
            <div key={rotulo} className="mb-1.5">
              <p className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-text-tertiary">
                {rotulo}
              </p>
              <ul className="flex flex-col gap-0.5">
                {itens.map((c) => {
                  const ativa = c.id === conversaSelecionadaId;
                  const confirmando = confirmandoId === c.id;
                  return (
                    <li key={c.id} className="group/item relative">
                      <button
                        onClick={() => onSelecionar(c)}
                        disabled={apagandoId === c.id}
                        className={`flex w-full flex-col gap-0.5 rounded-[11px] py-[7px] pl-2.5 pr-8 text-left text-[13px] transition disabled:opacity-50 ${
                          ativa ? "bg-accent-soft text-text-primary" : "text-text-primary hover:bg-glass-strong"
                        }`}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate ${ativa ? "font-bold" : "font-medium"}`}>
                            {c.titulo ?? `Usuário #${c.telegramChatId}`}
                            {c.status === "arquivada" && (
                              <span className="ml-1.5 align-middle text-[10px] font-normal text-text-tertiary">
                                arquivada
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 text-[10.5px] text-text-tertiary ${
                              ativa || confirmando ? "" : "opacity-0 group-hover/item:opacity-100"
                            } ${confirmando ? "invisible" : ""}`}
                          >
                            {formatarTempoRelativo(c.ultimaEm)}
                          </span>
                        </span>
                        {c.ultimaMensagem && (
                          <span className="min-w-0 truncate text-[11.5px] text-text-tertiary">
                            {c.ultimaRole === "user" ? "Você: " : ""}
                            {c.ultimaMensagem}
                          </span>
                        )}
                      </button>

                      {confirmando ? (
                        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                          <button
                            onClick={() => handleApagar(c.id)}
                            aria-label="Confirmar exclusão"
                            title="Confirmar exclusão"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-danger transition hover:bg-glass-strong"
                          >
                            <Check size={13} weight="bold" />
                          </button>
                          <button
                            onClick={() => setConfirmandoId(null)}
                            aria-label="Cancelar exclusão"
                            title="Cancelar exclusão"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition hover:bg-glass-strong"
                          >
                            <X size={13} weight="bold" />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmandoId(c.id)}
                          aria-label="Apagar conversa"
                          title="Apagar conversa"
                          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-text-tertiary opacity-0 transition hover:bg-glass-strong hover:text-danger group-hover/item:opacity-100"
                        >
                          <Trash size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>

      <div className="border-t border-border-subtle p-2">
        <button
          onClick={onAbrirConfig}
          className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left transition hover:bg-glass-strong"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-glass-strong text-text-secondary">
            <GearSix size={14} />
          </div>
          <span className="truncate text-[12.5px] font-semibold text-text-primary">Configurações</span>
        </button>
      </div>
    </div>
  );
}
