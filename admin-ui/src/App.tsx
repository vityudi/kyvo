import { useState } from "react";
import type { ConversaResumo } from "./api";
import { ConversaView } from "./components/ConversaView";
import { Home } from "./components/Home";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { useTheme } from "./lib/theme";

export function App() {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const { escuro, alternarTema } = useTheme();

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
    <div className="flex h-[100dvh] w-full gap-3.5 overflow-hidden p-3.5">
      {sidebarAberta && (
        <div className="glass-panel relative z-[2] flex h-full w-[284px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-glass-border bg-glass">
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
        </div>
      )}

      <div className="glass-panel relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-glass-border bg-glass">
        <TopBar
          sidebarAberta={sidebarAberta}
          tela={configuracoesAbertas ? "config" : "outra"}
          onAbrirSidebar={() => setSidebarAberta(true)}
          onNovaConversa={handleNovaConversa}
          onVoltarConfig={() => setConfiguracoesAbertas(false)}
          escuro={escuro}
          onAlternarTema={alternarTema}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {configuracoesAbertas ? (
            <SettingsView />
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
