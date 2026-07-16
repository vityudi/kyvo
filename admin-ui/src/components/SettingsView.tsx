import { useState } from "react";
import { ArrowLeft, PaperPlaneTilt, Plugs, Robot } from "@phosphor-icons/react";
import { IntegracoesView } from "./IntegracoesView";
import { ProvedoresView } from "./ProvedoresView";
import { TelegramStatusView } from "./TelegramStatusView";

type Aba = "provedores" | "telegram" | "integracoes";

const ABAS: { id: Aba; rotulo: string; icone: typeof Robot }[] = [
  { id: "provedores", rotulo: "Provedores de IA", icone: Robot },
  { id: "telegram", rotulo: "Telegram", icone: PaperPlaneTilt },
  { id: "integracoes", rotulo: "Integrações", icone: Plugs },
];

interface Props {
  onVoltar: () => void;
}

export function SettingsView({ onVoltar }: Props) {
  const [aba, setAba] = useState<Aba>("provedores");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
        <button
          onClick={onVoltar}
          aria-label="Voltar"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-sunken"
        >
          <ArrowLeft size={17} />
        </button>
        <h1 className="text-sm font-semibold text-text-primary">Configurações</h1>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-56 shrink-0 border-r border-border p-3">
          <ul className="flex flex-col gap-0.5">
            {ABAS.map(({ id, rotulo, icone: Icone }) => (
              <li key={id}>
                <button
                  onClick={() => setAba(id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    aba === id ? "bg-accent/10 font-medium text-text-primary" : "text-text-secondary hover:bg-surface-sunken"
                  }`}
                >
                  <Icone size={16} />
                  {rotulo}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {aba === "provedores" && <ProvedoresView />}
          {aba === "telegram" && <TelegramStatusView />}
          {aba === "integracoes" && <IntegracoesView />}
        </div>
      </div>
    </div>
  );
}
