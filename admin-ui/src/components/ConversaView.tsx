import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CaretRight,
  ChatsCircle,
  File,
  FilePdf,
  Paperclip,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { carregarMensagens, enviarMensagem, urlAnexo, type Anexo, type MensagemAdmin } from "../api";
import { formatarHorario } from "../lib/tempo";
import { Modal } from "./Modal";

interface Props {
  conversaId: string;
  telegramChatId: number;
  onMensagemEnviada: () => void;
}

let contadorOtimista = 0;

const ACEITA_ANEXO = "image/*,audio/*,application/pdf";

export function ConversaView({ conversaId, telegramChatId, onMensagemEnviada }: Props) {
  const [mensagens, setMensagens] = useState<MensagemAdmin[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [temMaisAntigas, setTemMaisAntigas] = useState(true);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [imagemAmpliada, setImagemAmpliada] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const alturaAnterior = useRef<number | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    setMensagens(null);
    setErroCarga(null);
    setTemMaisAntigas(true);

    async function carregar() {
      try {
        const lista = await carregarMensagens(conversaId);
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
  }, [conversaId]);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      try {
        const recentes = await carregarMensagens(conversaId);
        setMensagens((atual) => mesclarMensagens(atual, recentes));
      } catch {
        // polling silencioso - erro de rede pontual nao deve interromper a conversa aberta
      }
    }, 10_000);
    return () => clearInterval(intervalo);
  }, [conversaId]);

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
      const mais = await carregarMensagens(conversaId, mensagens[0].criadoEm);
      alturaAnterior.current = scrollRef.current?.scrollHeight ?? null;
      setMensagens((atual) => [...mais, ...(atual ?? [])]);
      setTemMaisAntigas(mais.length >= 50);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregandoAntigas(false);
    }
  }

  function handleSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = e.target.files?.[0];
    setArquivo(selecionado ?? null);
    e.target.value = "";
  }

  async function handleEnviar() {
    const conteudo = texto.trim();
    if ((!conteudo && !arquivo) || enviando) return;

    const idOtimista = `otimista-${contadorOtimista++}`;
    setMensagens((atual) => [
      ...(atual ?? []),
      { id: idOtimista, role: "user", conteudo, criadoEm: new Date().toISOString(), anexos: [] },
    ]);
    setTexto("");
    const arquivoEnviado = arquivo;
    setArquivo(null);
    setEnviando(true);
    setErroEnvio(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });

    try {
      await enviarMensagem(conversaId, conteudo, arquivoEnviado ?? undefined);
      const recentes = await carregarMensagens(conversaId);
      setMensagens((atual) => mesclarMensagens(atual?.filter((m) => m.id !== idOtimista) ?? null, recentes));
      onMensagemEnviada();
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : String(err));
      setMensagens((atual) => atual?.filter((m) => m.id !== idOtimista) ?? null);
      setTexto(conteudo);
      setArquivo(arquivoEnviado);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-6 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-glass-strong text-xs font-bold text-text-secondary">
          {String(telegramChatId).slice(-2)}
        </div>
        <div>
          <p className="text-[13.5px] font-bold text-text-primary">Usuário #{telegramChatId}</p>
          <p className="text-[11.5px] text-text-secondary">Telegram · chat {telegramChatId}</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          {erroCarga && <p className="text-sm text-danger">Falha ao carregar mensagens: {erroCarga}</p>}

          {!mensagens && !erroCarga && (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-12 w-2/5 animate-pulse rounded-2xl bg-glass-strong ${i % 2 ? "ml-auto" : ""}`} />
              ))}
            </div>
          )}

          {mensagens && mensagens.length === 0 && !erroCarga && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <ChatsCircle size={28} className="text-text-tertiary" />
              <p className="text-sm text-text-secondary">Nenhuma mensagem nessa conversa ainda.</p>
            </div>
          )}

          {mensagens && mensagens.length > 0 && (
            <>
              {temMaisAntigas && (
                <div className="mb-4 flex justify-center">
                  <button
                    onClick={carregarAntigas}
                    disabled={carregandoAntigas}
                    className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-glass-strong disabled:opacity-50"
                  >
                    {carregandoAntigas ? "Carregando…" : "Carregar mensagens anteriores"}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {mensagens.map((m) => {
                  const transcricoes = m.anexos.filter((a) => a.tipo === "audio" && a.transcricao);

                  return m.role === "user" ? (
                    <div key={m.id} className="flex flex-col items-end gap-1">
                      <div className="max-w-[75%] rounded-[18px_18px_4px_18px] bg-accent px-3.5 py-2.5 text-[13.5px] leading-relaxed text-accent-contrast">
                        {m.anexos.length > 0 && (
                          <div className="mb-2 flex flex-col gap-2">
                            {m.anexos.map((anexo) => (
                              <AnexoPreview key={anexo.id} anexo={anexo} onAmpliarImagem={setImagemAmpliada} />
                            ))}
                          </div>
                        )}
                        {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                        <p className="mt-1 text-[10px] opacity-70">{formatarHorario(m.criadoEm)}</p>
                      </div>
                      {transcricoes.map((anexo) => (
                        <TranscricaoAudio key={anexo.id} transcricao={anexo.transcricao!} />
                      ))}
                    </div>
                  ) : (
                    <div key={m.id} className="flex max-w-[75%] flex-col gap-1">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-deep text-[9.5px] font-extrabold text-accent-contrast">
                          K
                        </div>
                        <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-text-primary">
                          {m.anexos.length > 0 && (
                            <div className="mb-2 flex flex-col gap-2">
                              {m.anexos.map((anexo) => (
                                <AnexoPreview key={anexo.id} anexo={anexo} onAmpliarImagem={setImagemAmpliada} />
                              ))}
                            </div>
                          )}
                          {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                          <p className="mt-1 text-[10px] text-text-tertiary">{formatarHorario(m.criadoEm)}</p>
                        </div>
                      </div>
                      {transcricoes.map((anexo) => (
                        <TranscricaoAudio key={anexo.id} transcricao={anexo.transcricao!} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {erroEnvio && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 text-xs text-danger">
          <WarningCircle size={14} weight="fill" />
          {erroEnvio}
        </div>
      )}

      <div className="px-4 pb-4 pt-1">
        <div className="mx-auto w-full max-w-3xl">
          {arquivo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border-subtle bg-glass-strong px-3 py-2 text-xs text-text-secondary">
              <Paperclip size={14} />
              <span className="flex-1 truncate">{arquivo.name}</span>
              <button
                onClick={() => setArquivo(null)}
                aria-label="Remover anexo"
                className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-border"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="glass-input flex items-end gap-2 rounded-3xl border border-border-subtle bg-glass-strong p-2">
            <input
              ref={inputArquivoRef}
              type="file"
              accept={ACEITA_ANEXO}
              onChange={handleSelecionarArquivo}
              className="hidden"
            />
            <button
              onClick={() => inputArquivoRef.current?.click()}
              disabled={enviando}
              aria-label="Anexar arquivo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-glass disabled:opacity-40"
            >
              <Paperclip size={17} />
            </button>
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
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] text-text-primary placeholder:text-text-secondary focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={handleEnviar}
              disabled={enviando || (!texto.trim() && !arquivo)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar mensagem"
            >
              <ArrowUp size={16} weight="bold" />
            </button>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-text-tertiary">
            <ChatsCircle size={13} />A resposta do assistente é enviada de volta pro Telegram deste usuário também.
          </p>
        </div>
      </div>

      {imagemAmpliada && (
        <Modal titulo="Imagem" onFechar={() => setImagemAmpliada(null)}>
          <img src={imagemAmpliada} alt="Anexo ampliado" className="max-h-[75vh] w-full object-contain" />
        </Modal>
      )}
    </div>
  );
}

function AnexoPreview({ anexo, onAmpliarImagem }: { anexo: Anexo; onAmpliarImagem: (url: string) => void }) {
  const url = urlAnexo(anexo.id);

  if (anexo.tipo === "imagem") {
    return (
      <button onClick={() => onAmpliarImagem(url)} className="block overflow-hidden rounded-xl">
        <img src={url} alt={anexo.nomeArquivo ?? "Imagem enviada"} className="max-h-64 w-full object-cover" />
      </button>
    );
  }

  if (anexo.tipo === "audio") {
    return <audio controls src={url} className="h-9 max-w-full" />;
  }

  const Icone = anexo.mimeType === "application/pdf" ? FilePdf : File;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 text-sm opacity-90 transition hover:opacity-100"
    >
      <Icone size={18} />
      <span className="truncate">{anexo.nomeArquivo ?? "Documento"}</span>
    </a>
  );
}

function TranscricaoAudio({ transcricao }: { transcricao: string }) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className="max-w-[75%] text-[11.5px]">
      <button
        onClick={() => setAberta((a) => !a)}
        className="flex items-center gap-1 text-text-tertiary transition hover:text-text-secondary"
      >
        <CaretRight size={11} weight="bold" className={`transition-transform ${aberta ? "rotate-90" : ""}`} />
        Transcrição do áudio
      </button>
      {aberta && (
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-glass-strong px-2.5 py-2 italic text-text-secondary">
          "{transcricao}"
        </p>
      )}
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
