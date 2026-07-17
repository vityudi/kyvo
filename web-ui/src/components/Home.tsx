import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { criarConversa, listarConversas, type ConversaResumo } from "../api";

interface Props {
  onConversaCriada: (conversa: ConversaResumo, mensagemInicial: { texto: string; arquivo: File | null }) => void;
}

interface Contato {
  usuarioId: string;
  telegramChatId: number;
}

const ACEITA_ANEXO = "image/*,audio/*,application/pdf";

/**
 * Tela inicial (sem conversa selecionada), no estilo "novo chat" do
 * OpenWebUI: saudacao central + input flutuante. O app nao e multi-usuario -
 * so existe um contato do Telegram por tras do bot - entao o unico contato
 * ja e resolvido em segundo plano, sem pedir pra escolher nada. A conversa
 * so e criada no backend quando a primeira mensagem e enviada.
 */
export function Home({ onConversaCriada }: Props) {
  const [contato, setContato] = useState<Contato | null>(null);
  const [erroContato, setErroContato] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    listarConversas()
      .then((lista) => {
        if (cancelado) return;
        const primeira = lista[0];
        setContato(primeira ? { usuarioId: primeira.usuarioId, telegramChatId: primeira.telegramChatId } : null);
      })
      .catch((err) => !cancelado && setErroContato(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelado = true;
    };
  }, []);

  function handleSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = e.target.files?.[0];
    setArquivo(selecionado ?? null);
    e.target.value = "";
  }

  async function handleEnviar() {
    const conteudo = texto.trim();
    if ((!conteudo && !arquivo) || !contato || enviando) return;

    setEnviando(true);
    setErroEnvio(null);
    try {
      const nova = await criarConversa(contato.usuarioId);
      // Navega pro chat assim que a conversa e criada, sem esperar o agente
      // responder - a propria ConversaView dispara essa mensagem inicial e
      // mostra a bolha otimista + espera da resposta, igual um envio normal.
      onConversaCriada(
        {
          id: nova.id,
          usuarioId: nova.usuarioId,
          telegramChatId: contato.telegramChatId,
          titulo: nova.titulo,
          status: nova.status,
          ultimaMensagem: conteudo || null,
          ultimaRole: "user",
          ultimaEm: new Date().toISOString(),
          totalMensagens: arquivo ? 2 : 1,
        },
        { texto: conteudo, arquivo },
      );
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  const semContato = contato === null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-deep text-xl font-extrabold text-accent-contrast shadow-[0_14px_30px_-10px_var(--accent-soft)]">
          K
        </div>
        <h1 className="font-serif text-[26px] italic tracking-tight text-text-primary">Pronto quando você estiver</h1>
        <p className="max-w-sm text-[13.5px] text-text-secondary">Mande a primeira mensagem — a conversa é criada automaticamente.</p>
      </div>

      <div className="w-full max-w-2xl">
        {erroContato && <p className="mb-2 text-center text-sm text-danger">Falha ao carregar contato: {erroContato}</p>}

        {semContato && !erroContato && (
          <p className="mb-2 text-center text-sm text-text-secondary">
            Nenhum contato ainda — assim que alguém falar com o bot no Telegram, dá pra conversar por aqui.
          </p>
        )}

        {erroEnvio && (
          <div className="mb-2 flex items-center justify-center gap-2 text-xs text-danger">
            <WarningCircle size={14} weight="fill" />
            {erroEnvio}
          </div>
        )}

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
            disabled={enviando || semContato}
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
            placeholder={semContato ? "Nenhum contato disponível ainda…" : "Enviar mensagem…"}
            rows={1}
            disabled={enviando || semContato}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] text-text-primary placeholder:text-text-secondary focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleEnviar}
            disabled={enviando || semContato || (!texto.trim() && !arquivo)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensagem"
          >
            {enviando ? <Sparkle size={16} className="animate-pulse" weight="fill" /> : <ArrowUp size={16} weight="bold" />}
          </button>
        </div>
      </div>
    </div>
  );
}
