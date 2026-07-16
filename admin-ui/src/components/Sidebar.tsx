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
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => onSelecionar(c)}
                        className={`group flex w-full items-center gap-2 rounded-[11px] px-2.5 py-[9px] text-left text-[13px] transition ${
                          ativa ? "bg-accent-soft text-text-primary" : "text-text-primary hover:bg-glass-strong"
                        }`}
                      >
                        <span className={`min-w-0 flex-1 truncate ${ativa ? "font-bold" : "font-medium"}`}>
                          {c.titulo ?? `Usuário #${c.telegramChatId}`}
                          {c.status === "arquivada" && (
                            <span className="ml-1.5 align-middle text-[10px] font-normal text-text-tertiary">
                              arquivada
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-[10.5px] text-text-tertiary ${ativa ? "" : "opacity-0 group-hover:opacity-100"}`}
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
