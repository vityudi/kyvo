import { useState } from "react";
import { PaperPlaneTilt, Plugs, Robot } from "@phosphor-icons/react";
import { IntegracoesView } from "./IntegracoesView";
import { ProvedoresView } from "./ProvedoresView";
import { TelegramStatusView } from "./TelegramStatusView";

type Aba = "provedores" | "telegram" | "integracoes";

const ABAS: { id: Aba; rotulo: string; icone: typeof Robot }[] = [
  { id: "provedores", rotulo: "Provedores de IA", icone: Robot },
  { id: "telegram", rotulo: "Telegram", icone: PaperPlaneTilt },
  { id: "integracoes", rotulo: "Integrações", icone: Plugs },
];

export function SettingsView() {
  const [aba, setAba] = useState<Aba>("provedores");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-[220px] shrink-0 border-r border-border-subtle p-3.5">
          <ul className="flex flex-col gap-0.5">
            {ABAS.map(({ id, rotulo, icone: Icone }) => {
              const ativa = aba === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => setAba(id)}
                    className={`flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left text-[13px] transition ${
                      ativa ? "bg-accent-soft" : "hover:bg-glass-strong"
                    }`}
                  >
                    <Icone size={16} className={ativa ? "text-accent" : "text-text-secondary"} />
                    <span className={`text-text-primary ${ativa ? "font-bold" : "font-medium"}`}>{rotulo}</span>
                  </button>
                </li>
              );
            })}
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
