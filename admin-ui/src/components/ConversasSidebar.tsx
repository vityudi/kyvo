import { useEffect, useMemo, useState } from "react";
import { ChatCircle, MagnifyingGlass } from "@phosphor-icons/react";
import { listarConversas, type ConversaResumo } from "../api";
import { formatarTempoRelativo } from "../lib/tempo";

interface Props {
  usuarioSelecionadoId: string | null;
  onSelecionar: (conversa: ConversaResumo) => void;
  atualizarSinal: number;
}

export function ConversasSidebar({ usuarioSelecionadoId, onSelecionar, atualizarSinal }: Props) {
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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="relative">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por chat id"
            className="w-full rounded-lg border border-border bg-surface-sunken py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {erro && <p className="px-4 py-3 text-sm text-danger">Falha ao carregar: {erro}</p>}

        {!conversas && !erro && (
          <div className="flex flex-col gap-1 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
                <div className="flex-1">
                  <div className="mb-1.5 h-3 w-24 animate-pulse rounded bg-surface-sunken" />
                  <div className="h-2.5 w-36 animate-pulse rounded bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        )}

        {filtradas && filtradas.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ChatCircle size={28} className="text-text-secondary" />
            <p className="text-sm text-text-secondary">
              {busca ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
            </p>
          </div>
        )}

        {filtradas && filtradas.length > 0 && (
          <ul className="flex flex-col gap-0.5 p-2">
            {filtradas.map((c) => {
              const ativa = c.usuarioId === usuarioSelecionadoId;
              return (
                <li key={c.usuarioId}>
                  <button
                    onClick={() => onSelecionar(c)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition ${
                      ativa ? "bg-accent/10" : "hover:bg-surface-sunken"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        ativa ? "bg-accent text-accent-contrast" : "bg-surface-sunken text-text-secondary"
                      }`}
                    >
                      {String(c.telegramChatId).slice(-2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-text-primary">
                          Usuário #{c.telegramChatId}
                        </p>
                        <span className="shrink-0 text-[11px] text-text-secondary">
                          {formatarTempoRelativo(c.ultimaEm)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-text-secondary">
                        {c.ultimaRole === "assistant" ? "Kyvo: " : ""}
                        {c.ultimaMensagem}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
