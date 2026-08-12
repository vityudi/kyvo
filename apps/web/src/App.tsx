import { useEffect, useState } from "react";
import { listarConversas, type ConversaResumo } from "./api";
import { ContasCartoesView } from "./components/ContasCartoesView";
import { ConversaView } from "./components/ConversaView";
import { DashboardView } from "./components/DashboardView";
import { Home } from "./components/Home";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TransacoesView } from "./components/TransacoesView";
import { pollingVisivel } from "./lib/pollingVisivel";
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
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [erroConversas, setErroConversas] = useState<string | null>(null);
  const { escuro, alternarTema } = useTheme();

  // Fonte unica da lista de conversas - Sidebar e Home (achar o contato do
  // Telegram) dependem dela, entao busca aqui em vez de cada tela pedir a
  // mesma coisa em paralelo. So mantem o polling ligado com a tela de chat
  // aberta - nas outras telas a lista nao precisa se atualizar sozinha.
  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const lista = await listarConversas();
        if (!cancelado) {
          setConversas(lista);
          setErroConversas(null);
        }
      } catch (err) {
        if (!cancelado) setErroConversas(err instanceof Error ? err.message : String(err));
      }
    }

    carregar();
    const pararPolling = tela === "chat" ? pollingVisivel(carregar, 10_000) : null;
    return () => {
      cancelado = true;
      pararPolling?.();
    };
  }, [atualizarSinal, tela]);

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
    setConversas((atual) => atual?.filter((c) => c.id !== conversaId) ?? atual);
  }

  return (
    <div className="flex h-[100dvh] w-full gap-3.5 overflow-hidden p-3.5">
      {sidebarAberta && (
        <div className="glass-panel relative z-[2] flex h-full w-[284px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-glass-border bg-glass">
          <Sidebar
            conversas={conversas}
            erro={erroConversas}
            conversaSelecionadaId={conversaSelecionada?.id ?? null}
            telaAtiva={tela === "transacoes" || tela === "dashboard" || tela === "contas" ? tela : null}
            onSelecionar={(conversa) => {
              setTela("chat");
              setConversaSelecionada(conversa);
            }}
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
              arquivada={conversaSelecionada.status === "arquivada"}
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
