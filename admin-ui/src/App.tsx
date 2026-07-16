import { useState, type ReactNode } from "react";
import { ChatsCircle, GearSix } from "@phosphor-icons/react";
import { ConversasSidebar } from "./components/ConversasSidebar";
import { ConversaView } from "./components/ConversaView";
import { ProvedoresView } from "./components/ProvedoresView";
import type { ConversaResumo } from "./api";

type View = "conversas" | "provedores";

export function App() {
  const [view, setView] = useState<View>("conversas");
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaResumo | null>(null);
  const [atualizarSinal, setAtualizarSinal] = useState(0);

  return (
    <div className="flex h-[100dvh] bg-bg">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border py-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-contrast">
          K
        </div>
        <NavButton
          label="Conversas"
          ativo={view === "conversas"}
          onClick={() => setView("conversas")}
          icon={<ChatsCircle size={20} weight={view === "conversas" ? "fill" : "regular"} />}
        />
        <NavButton
          label="Provedores"
          ativo={view === "provedores"}
          onClick={() => setView("provedores")}
          icon={<GearSix size={20} weight={view === "provedores" ? "fill" : "regular"} />}
        />
      </nav>

      {view === "conversas" && (
        <div className="w-80 shrink-0 border-r border-border">
          <ConversasSidebar
            usuarioSelecionadoId={conversaSelecionada?.usuarioId ?? null}
            onSelecionar={setConversaSelecionada}
            atualizarSinal={atualizarSinal}
          />
        </div>
      )}

      <main className="min-w-0 flex-1">
        {view === "conversas" ? (
          conversaSelecionada ? (
            <ConversaView
              key={conversaSelecionada.usuarioId}
              usuarioId={conversaSelecionada.usuarioId}
              telegramChatId={conversaSelecionada.telegramChatId}
              onMensagemEnviada={() => setAtualizarSinal((n) => n + 1)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <ChatsCircle size={32} className="text-text-secondary" />
              <p className="text-sm text-text-secondary">Selecione uma conversa para visualizar</p>
            </div>
          )
        ) : (
          <ProvedoresView />
        )}
      </main>
    </div>
  );
}

function NavButton({
  label,
  ativo,
  onClick,
  icon,
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
        ativo ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-sunken"
      }`}
    >
      {icon}
    </button>
  );
}
