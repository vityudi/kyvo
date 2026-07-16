import { useEffect, useMemo, useState } from "react";
import { ChatCircle, GearSix, MagnifyingGlass, PencilSimpleLine, SidebarSimple } from "@phosphor-icons/react";
import { listarConversas, type ConversaResumo } from "../api";
import { formatarTempoRelativo, rotuloGrupoData } from "../lib/tempo";

interface Props {
  conversaSelecionadaId: string | null;
  onSelecionar: (conversa: ConversaResumo) => void;
  atualizarSinal: number;
  onNovaConversa: () => void;
  onAbrirConfig: () => void;
  onFechar: () => void;
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
}: Props) {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

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
    <div className="flex h-full w-[272px] shrink-0 flex-col bg-bg">
      <div className="flex items-center gap-1 px-3 pb-1 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-contrast">
          K
        </div>
        <span className="flex-1 truncate text-sm font-semibold text-text-primary">Kyvo</span>
        <button
          onClick={onFechar}
          aria-label="Recolher barra lateral"
          title="Recolher barra lateral"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-sunken"
        >
          <SidebarSimple size={17} />
        </button>
      </div>

      <div className="px-2 pt-2">
        <button
          onClick={onNovaConversa}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-sunken"
        >
          <PencilSimpleLine size={17} />
          Nova conversa
        </button>

        <div className="relative mt-1">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por chat id"
            className="w-full rounded-lg bg-transparent py-1.5 pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-secondary hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
        {erro && <p className="px-2 py-3 text-sm text-danger">Falha ao carregar: {erro}</p>}

        {!conversas && !erro && (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-sunken" />
            ))}
          </div>
        )}

        {filtradas && filtradas.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ChatCircle size={26} className="text-text-secondary" />
            <p className="text-sm text-text-secondary">
              {busca ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
            </p>
          </div>
        )}

        {grupos &&
          Array.from(grupos.entries()).map(([rotulo, itens]) => (
            <div key={rotulo} className="mb-2">
              <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-text-secondary">{rotulo}</p>
              <ul className="flex flex-col gap-0.5">
                {itens.map((c) => {
                  const ativa = c.id === conversaSelecionadaId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => onSelecionar(c)}
                        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          ativa ? "bg-accent/10 text-text-primary" : "text-text-primary hover:bg-surface-sunken"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {c.titulo ?? `Usuário #${c.telegramChatId}`}
                          {c.status === "arquivada" && (
                            <span className="ml-1.5 align-middle text-[10px] font-normal text-text-secondary">
                              arquivada
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] text-text-secondary ${ativa ? "" : "opacity-0 group-hover:opacity-100"}`}
                        >
                          {formatarTempoRelativo(c.ultimaEm)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>

      <div className="border-t border-border p-2">
        <button
          onClick={onAbrirConfig}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-sunken"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
            <GearSix size={15} />
          </div>
          <span className="truncate text-sm font-medium text-text-primary">Provedor de IA</span>
        </button>
      </div>
    </div>
  );
}
