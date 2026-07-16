import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChatsCircle, WarningCircle } from "@phosphor-icons/react";
import { carregarMensagens, enviarMensagem, type MensagemAdmin } from "../api";
import { formatarHorario } from "../lib/tempo";

interface Props {
  usuarioId: string;
  telegramChatId: number;
  onMensagemEnviada: () => void;
}

let contadorOtimista = 0;

export function ConversaView({ usuarioId, telegramChatId, onMensagemEnviada }: Props) {
  const [mensagens, setMensagens] = useState<MensagemAdmin[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [temMaisAntigas, setTemMaisAntigas] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const alturaAnterior = useRef<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    setMensagens(null);
    setErroCarga(null);
    setTemMaisAntigas(true);

    async function carregar() {
      try {
        const lista = await carregarMensagens(usuarioId);
        if (!cancelado) {
          setMensagens(lista);
          setTemMaisAntigas(lista.length >= 50);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
          });
        }
      } catch (err) {
        if (!cancelado) setErroCarga(err instanceof Error ? err.message : String(err));
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [usuarioId]);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      try {
        const recentes = await carregarMensagens(usuarioId);
        setMensagens((atual) => mesclarMensagens(atual, recentes));
      } catch {
        // polling silencioso - erro de rede pontual nao deve interromper a conversa aberta
      }
    }, 10_000);
    return () => clearInterval(intervalo);
  }, [usuarioId]);

  useEffect(() => {
    if (alturaAnterior.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - alturaAnterior.current;
      alturaAnterior.current = null;
    }
  }, [mensagens]);

  async function carregarAntigas() {
    if (!mensagens || mensagens.length === 0) return;
    setCarregandoAntigas(true);
    try {
      const mais = await carregarMensagens(usuarioId, mensagens[0].criadoEm);
      alturaAnterior.current = scrollRef.current?.scrollHeight ?? null;
      setMensagens((atual) => [...mais, ...(atual ?? [])]);
      setTemMaisAntigas(mais.length >= 50);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregandoAntigas(false);
    }
  }

  async function handleEnviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    const idOtimista = `otimista-${contadorOtimista++}`;
    setMensagens((atual) => [
      ...(atual ?? []),
      { id: idOtimista, role: "user", conteudo, criadoEm: new Date().toISOString() },
    ]);
    setTexto("");
    setEnviando(true);
    setErroEnvio(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });

    try {
      await enviarMensagem(usuarioId, conteudo);
      const recentes = await carregarMensagens(usuarioId);
      setMensagens((atual) => mesclarMensagens(atual?.filter((m) => m.id !== idOtimista) ?? null, recentes));
      onMensagemEnviada();
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : String(err));
      setMensagens((atual) => atual?.filter((m) => m.id !== idOtimista) ?? null);
      setTexto(conteudo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-text-secondary">
          {String(telegramChatId).slice(-2)}
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Usuário #{telegramChatId}</p>
          <p className="text-xs text-text-secondary">Telegram · chat {telegramChatId}</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {erroCarga && <p className="text-sm text-danger">Falha ao carregar mensagens: {erroCarga}</p>}

        {!mensagens && !erroCarga && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-12 w-2/5 animate-pulse rounded-2xl bg-surface-sunken ${i % 2 ? "ml-auto" : ""}`} />
            ))}
          </div>
        )}

        {mensagens && (
          <>
            {temMaisAntigas && (
              <div className="mb-4 flex justify-center">
                <button
                  onClick={carregarAntigas}
                  disabled={carregandoAntigas}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-sunken disabled:opacity-50"
                >
                  {carregandoAntigas ? "Carregando…" : "Carregar mensagens anteriores"}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-accent text-accent-contrast"
                        : "border border-border bg-surface text-text-primary"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.conteudo}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.role === "user" ? "text-accent-contrast/70" : "text-text-secondary"
                      }`}
                    >
                      {formatarHorario(m.criadoEm)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {erroEnvio && (
        <div className="flex items-center gap-2 border-t border-border bg-danger/10 px-6 py-2 text-xs text-danger">
          <WarningCircle size={14} weight="fill" />
          {erroEnvio}
        </div>
      )}

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-sunken p-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
            placeholder="Enviar mensagem como este usuário…"
            rows={1}
            disabled={enviando}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleEnviar}
            disabled={enviando || !texto.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensagem"
          >
            <ArrowUp size={16} weight="bold" />
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <ChatsCircle size={13} />A resposta do assistente é enviada de volta pro Telegram deste usuário também.
        </p>
      </div>
    </div>
  );
}

function mesclarMensagens(atual: MensagemAdmin[] | null, recentes: MensagemAdmin[]): MensagemAdmin[] {
  const base = atual ?? [];
  const idsConhecidos = new Set(base.map((m) => m.id));
  const novas = recentes.filter((m) => !idsConhecidos.has(m.id));
  if (novas.length === 0) return base;
  return [...base, ...novas].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}
