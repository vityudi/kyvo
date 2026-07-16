import { useState } from "react";
import type { ConversaResumo } from "./api";
import { ConversaView } from "./components/ConversaView";
import { Home } from "./components/Home";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function App() {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(true);

  function handleNovaConversa() {
    setConfiguracoesAbertas(false);
    setConversaSelecionada(null);
  }

  function handleConversaCriada(conversa: ConversaResumo) {
    setConfiguracoesAbertas(false);
    setConversaSelecionada(conversa);
    setAtualizarSinal((n) => n + 1);
  }

  return (
    <div className="flex h-[100dvh] bg-bg">
      {sidebarAberta && (
        <Sidebar
          conversaSelecionadaId={conversaSelecionada?.id ?? null}
          onSelecionar={(conversa) => {
            setConfiguracoesAbertas(false);
            setConversaSelecionada(conversa);
          }}
          atualizarSinal={atualizarSinal}
          onNovaConversa={handleNovaConversa}
          onAbrirConfig={() => setConfiguracoesAbertas(true)}
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
          {configuracoesAbertas ? (
            <SettingsView onVoltar={() => setConfiguracoesAbertas(false)} />
          ) : conversaSelecionada ? (
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
    </div>
  );
}
