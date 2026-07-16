import { useState } from "react";
import type { ConversaResumo } from "./api";
import { ConversaView } from "./components/ConversaView";
import { Home } from "./components/Home";
import { Modal } from "./components/Modal";
import { ProvedoresView } from "./components/ProvedoresView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function App() {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);
  const [configAberta, setConfigAberta] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(true);

  function handleNovaConversa() {
    setConversaSelecionada(null);
  }

  function handleConversaCriada(conversa: ConversaResumo) {
    setConversaSelecionada(conversa);
    setAtualizarSinal((n) => n + 1);
  }

  return (
    <div className="flex h-[100dvh] bg-bg">
      {sidebarAberta && (
        <Sidebar
          conversaSelecionadaId={conversaSelecionada?.id ?? null}
          onSelecionar={setConversaSelecionada}
          atualizarSinal={atualizarSinal}
          onNovaConversa={handleNovaConversa}
          onAbrirConfig={() => setConfigAberta(true)}
          onFechar={() => setSidebarAberta(false)}
        />
      )}

      <div
        className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-surface ${
          sidebarAberta ? "rounded-tl-2xl border-l border-t border-border" : ""
        }`}
      >
        <TopBar sidebarAberta={sidebarAberta} onAbrirSidebar={() => setSidebarAberta(true)} onNovaConversa={handleNovaConversa} />

        <main className="flex min-h-0 flex-1 flex-col">
          {conversaSelecionada ? (
            <ConversaView
              key={conversaSelecionada.id}
              conversaId={conversaSelecionada.id}
              telegramChatId={conversaSelecionada.telegramChatId}
              onMensagemEnviada={() => setAtualizarSinal((n) => n + 1)}
            />
          ) : (
            <Home onConversaCriada={handleConversaCriada} />
          )}
        </main>
      </div>

      {configAberta && (
        <Modal titulo="Provedor de IA" onFechar={() => setConfigAberta(false)}>
          <ProvedoresView />
        </Modal>
      )}
    </div>
  );
}
