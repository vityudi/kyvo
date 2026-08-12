import { useState } from "react";
import type { ConversaResumo } from "./api";
import { ContasCartoesView } from "./components/ContasCartoesView";
import { ConversaView } from "./components/ConversaView";
import { DashboardView } from "./components/DashboardView";
import { Home } from "./components/Home";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TransacoesView } from "./components/TransacoesView";
import { useTheme } from "./lib/theme";

interface MensagemInicialPendente {
  conversaId: string;
  texto: string;
  arquivo: File | null;
}

type Tela = "chat" | "config" | "transacoes" | "dashboard" | "contas";

export function App() {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [mensagemInicialPendente, setMensagemInicialPendente] = useState<MensagemInicialPendente | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);
  const [tela, setTela] = useState<Tela>("chat");
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const { escuro, alternarTema } = useTheme();

  function handleNovaConversa() {
    setTela("chat");
    setConversaSelecionada(null);
  }

  function handleConversaCriada(conversa: ConversaResumo, mensagemInicial: { texto: string; arquivo: File | null }) {
    setTela("chat");
    setConversaSelecionada(conversa);
    setMensagemInicialPendente({ conversaId: conversa.id, ...mensagemInicial });
    setAtualizarSinal((n) => n + 1);
  }

  function handleConversaDeletada(conversaId: string) {
    setConversaSelecionada((atual) => (atual?.id === conversaId ? null : atual));
  }

  return (
    <div className="flex h-[100dvh] w-full gap-3.5 overflow-hidden p-3.5">
      {sidebarAberta && (
        <div className="glass-panel relative z-[2] flex h-full w-[284px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-glass-border bg-glass">
          <Sidebar
            conversaSelecionadaId={conversaSelecionada?.id ?? null}
            telaAtiva={tela === "transacoes" || tela === "dashboard" || tela === "contas" ? tela : null}
            chatAberto={tela === "chat"}
            onSelecionar={(conversa) => {
              setTela("chat");
              setConversaSelecionada(conversa);
            }}
            atualizarSinal={atualizarSinal}
            onNovaConversa={handleNovaConversa}
            onAbrirConfig={() => setTela("config")}
            onAbrirTransacoes={() => setTela("transacoes")}
            onAbrirDashboard={() => setTela("dashboard")}
            onAbrirContasCartoes={() => setTela("contas")}
            onFechar={() => setSidebarAberta(false)}
            onConversaDeletada={handleConversaDeletada}
          />
        </div>
      )}

      <div className="glass-panel relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-glass-border bg-glass">
        <TopBar
          sidebarAberta={sidebarAberta}
          tela={tela === "config" || tela === "transacoes" || tela === "dashboard" || tela === "contas" ? tela : "outra"}
          onAbrirSidebar={() => setSidebarAberta(true)}
          onNovaConversa={handleNovaConversa}
          onVoltar={() => setTela("chat")}
          escuro={escuro}
          onAlternarTema={alternarTema}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {tela === "config" ? (
            <SettingsView />
          ) : tela === "transacoes" ? (
            <TransacoesView />
          ) : tela === "dashboard" ? (
            <DashboardView />
          ) : tela === "contas" ? (
            <ContasCartoesView />
          ) : conversaSelecionada ? (
            <ConversaView
              key={conversaSelecionada.id}
              conversaId={conversaSelecionada.id}
              telegramChatId={conversaSelecionada.telegramChatId}
              onMensagemEnviada={() => setAtualizarSinal((n) => n + 1)}
              mensagemInicial={
                mensagemInicialPendente?.conversaId === conversaSelecionada.id
                  ? { texto: mensagemInicialPendente.texto, arquivo: mensagemInicialPendente.arquivo }
                  : null
              }
              onMensagemInicialConsumida={() => setMensagemInicialPendente(null)}
            />
          ) : (
            <Home onConversaCriada={handleConversaCriada} />
          )}
        </main>
      </div>
    </div>
  );
}
