import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CaretDown,
  Check,
  Moon,
  PencilSimpleLine,
  SidebarSimple,
  Sun,
} from "@phosphor-icons/react";
import { ativarProvedor, listarProvedores, obterStatusTelegram, type ProvedorResumo } from "../api";

const NOME_PROVIDER: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
};

interface Props {
  sidebarAberta: boolean;
  tela: "config" | "outra";
  onAbrirSidebar: () => void;
  onNovaConversa: () => void;
  onVoltarConfig: () => void;
  escuro: boolean;
  onAlternarTema: () => void;
}

export function TopBar({
  sidebarAberta,
  tela,
  onAbrirSidebar,
  onNovaConversa,
  onVoltarConfig,
  escuro,
  onAlternarTema,
}: Props) {
  const [provedores, setProvedores] = useState<ProvedorResumo[] | null>(null);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [telegramConectado, setTelegramConectado] = useState<boolean | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listarProvedores()
      .then(setProvedores)
      .catch(() => setProvedores(null));
    obterStatusTelegram()
      .then((s) => setTelegramConectado(s.conectado))
      .catch(() => setTelegramConectado(false));
    // Refaz a busca sempre que sai da tela de config - ativar um provedor ou
    // reconectar o Telegram nao dispara nenhum evento pro TopBar, entao sem
    // isso o indicador ficava preso no estado do primeiro carregamento ate
    // um reload de pagina.
  }, [tela]);

  useEffect(() => {
    if (!dropdownAberto) return;
    function handleClickFora(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [dropdownAberto]);

  async function handleSelecionarProvedor(provider: ProvedorResumo["provider"]) {
    setDropdownAberto(false);
    try {
      await ativarProvedor(provider);
      const lista = await listarProvedores();
      setProvedores(lista);
    } catch {
      // silencioso - o dropdown so reflete o provedor ativo, sem bloquear a UI por uma falha pontual
    }
  }

  const provedorAtivo = provedores?.find((p) => p.ativo) ?? null;

  return (
    <header className="relative z-[3] flex shrink-0 items-center gap-2.5 border-b border-border-subtle px-4.5 py-2.5">
      {tela === "config" ? (
        <>
          <button
            onClick={onVoltarConfig}
            aria-label="Voltar"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-glass-strong"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[14.5px] font-bold tracking-tight text-text-primary">Configurações</h1>
        </>
      ) : (
        !sidebarAberta && (
          <>
            <button
              onClick={onAbrirSidebar}
              title="Expandir barra lateral"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-glass-strong"
            >
              <SidebarSimple size={16} />
            </button>
            <button
              onClick={onNovaConversa}
              title="Nova conversa"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-glass-strong"
            >
              <PencilSimpleLine size={16} />
            </button>
            <div className="ml-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br from-accent to-accent-deep text-[10.5px] font-extrabold text-accent-contrast">
              K
            </div>
            <span className="text-[13.5px] font-bold text-text-primary">Kyvo</span>
          </>
        )
      )}

      {provedorAtivo && (
        <div ref={dropdownRef} className="relative ml-1.5">
          <button
            onClick={() => setDropdownAberto((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-glass-strong px-2.5 py-1.5"
          >
            <span className="whitespace-nowrap text-xs font-semibold text-text-primary">
              {NOME_PROVIDER[provedorAtivo.provider] ?? provedorAtivo.provider}
            </span>
            <CaretDown size={12} weight="bold" className="text-text-secondary" />
          </button>

          {dropdownAberto && (
            <div className="absolute left-0 top-10 z-10 w-[230px] rounded-2xl border border-border-subtle bg-glass-strong p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-2xl">
              {provedores?.map((p) => {
                const ativo = p.provider === provedorAtivo.provider;
                return (
                  <button
                    key={p.provider}
                    onClick={() => handleSelecionarProvedor(p.provider)}
                    className={`flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left transition ${
                      ativo ? "bg-accent-soft" : "hover:bg-glass"
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] text-text-primary ${
                        ativo ? "font-bold" : "font-medium"
                      }`}
                    >
                      {NOME_PROVIDER[p.provider] ?? p.provider}
                    </span>
                    {ativo && <Check size={14} weight="bold" className="text-accent" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {telegramConectado !== null && (
          <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-glass-strong py-1.5 pl-2.5 pr-3">
            <div
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${telegramConectado ? "bg-accent" : "bg-danger"}`}
              style={
                telegramConectado
                  ? { boxShadow: "0 0 0 3px var(--accent-soft)" }
                  : undefined
              }
            />
            <span className="whitespace-nowrap text-xs font-semibold text-text-primary">
              {telegramConectado ? "Telegram conectado" : "Telegram desconectado"}
            </span>
          </div>
        )}

        <button
          onClick={onAlternarTema}
          title="Alternar tema"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-glass-strong text-text-secondary transition"
        >
          {escuro ? <Moon size={14} weight="fill" /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  );
}
