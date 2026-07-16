import { useState } from "react";
import { ChatsCircle, GearSix } from "@phosphor-icons/react";
import { criarConversa, type ConversaResumo } from "./api";
import { AppHeader } from "./components/AppHeader";
import { ConversasSidebar } from "./components/ConversasSidebar";
import { ConversaView } from "./components/ConversaView";
import { Modal } from "./components/Modal";
import { ProvedoresView } from "./components/ProvedoresView";

export function App() {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);
  const [configAberta, setConfigAberta] = useState(false);
  const [criandoConversa, setCriandoConversa] = useState(false);

  async function handleNovaConversa() {
    if (!conversaSelecionada || criandoConversa) return;
    setCriandoConversa(true);
    try {
      const nova = await criarConversa(conversaSelecionada.usuarioId);
      setConversaSelecionada({
        ...nova,
        telegramChatId: conversaSelecionada.telegramChatId,
        ultimaMensagem: null,
        ultimaRole: null,
        ultimaEm: new Date().toISOString(),
        totalMensagens: 0,
      });
      setAtualizarSinal((n) => n + 1);
    } finally {
      setCriandoConversa(false);
    }
  }

  return (
    <div className="flex h-[100dvh] bg-bg">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border py-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-contrast">
          K
        </div>
        <button
          disabled
          aria-label="Conversas"
          title="Conversas"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"
        >
          <ChatsCircle size={20} weight="fill" />
        </button>
        <button
          onClick={() => setConfigAberta(true)}
          aria-label="Configurar provedor de IA"
          title="Configurar provedor de IA"
          className="mt-auto flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-sunken"
        >
          <GearSix size={20} />
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          podeIniciarConversa={conversaSelecionada !== null}
          criandoConversa={criandoConversa}
          onNovaConversa={handleNovaConversa}
        />

        <div className="flex min-h-0 flex-1">
          <div className="w-80 shrink-0 border-r border-border">
            <ConversasSidebar
              conversaSelecionadaId={conversaSelecionada?.id ?? null}
              onSelecionar={setConversaSelecionada}
              atualizarSinal={atualizarSinal}
            />
          </div>

          <main className="flex min-w-0 flex-1 flex-col">
            {conversaSelecionada ? (
              <ConversaView
                key={conversaSelecionada.id}
                conversaId={conversaSelecionada.id}
                telegramChatId={conversaSelecionada.telegramChatId}
                onMensagemEnviada={() => setAtualizarSinal((n) => n + 1)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ChatsCircle size={32} className="text-text-secondary" />
                <p className="text-sm text-text-secondary">Selecione uma conversa para visualizar</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {configAberta && (
        <Modal titulo="Provedor de IA" onFechar={() => setConfigAberta(false)}>
          <ProvedoresView />
        </Modal>
      )}
    </div>
  );
}
