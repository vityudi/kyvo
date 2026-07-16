import { useEffect, useState } from "react";
import { CheckCircle, CircleDashed, WarningCircle } from "@phosphor-icons/react";
import { ativarProvedor, listarProvedores, salvarProvedor, testarProvedor, type ProvedorResumo } from "../api";

const NOME_PROVIDER: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
};

interface ProviderCardState {
  modelo: string;
  apiKey: string;
  salvando: boolean;
  testando: boolean;
  ativando: boolean;
  status: { tipo: "ok" | "erro"; texto: string } | null;
}

export function ProvedoresView() {
  const [provedores, setProvedores] = useState<ProvedorResumo[] | null>(null);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [cardState, setCardState] = useState<Record<string, ProviderCardState>>({});

  async function carregar() {
    try {
      const lista = await listarProvedores();
      setProvedores(lista);
      setCardState((atual) => {
        const proximo = { ...atual };
        for (const p of lista) {
          if (!proximo[p.provider]) {
            proximo[p.provider] = {
              modelo: p.modelo,
              apiKey: "",
              salvando: false,
              testando: false,
              ativando: false,
              status: null,
            };
          }
        }
        return proximo;
      });
    } catch (err) {
      setErroCarregamento(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function updateCard(provider: string, patch: Partial<ProviderCardState>) {
    setCardState((atual) => ({ ...atual, [provider]: { ...atual[provider], ...patch } }));
  }

  async function handleSalvar(provider: "anthropic" | "deepseek") {
    const state = cardState[provider];
    if (!state) return;
    updateCard(provider, { salvando: true, status: null });
    try {
      await salvarProvedor(provider, state.modelo, state.apiKey);
      updateCard(provider, { apiKey: "", status: { tipo: "ok", texto: "Salvo." } });
      await carregar();
    } catch (err) {
      updateCard(provider, { status: { tipo: "erro", texto: err instanceof Error ? err.message : String(err) } });
    } finally {
      updateCard(provider, { salvando: false });
    }
  }

  async function handleTestar(provider: "anthropic" | "deepseek") {
    updateCard(provider, { testando: true, status: null });
    const resultado = await testarProvedor(provider);
    updateCard(provider, {
      testando: false,
      status: resultado.ok
        ? { tipo: "ok", texto: "Conexão funcionando." }
        : { tipo: "erro", texto: resultado.erro },
    });
  }

  async function handleAtivar(provider: "anthropic" | "deepseek") {
    updateCard(provider, { ativando: true, status: null });
    try {
      await ativarProvedor(provider);
      updateCard(provider, { status: { tipo: "ok", texto: "Provedor ativado." } });
      await carregar();
    } catch (err) {
      updateCard(provider, { status: { tipo: "erro", texto: err instanceof Error ? err.message : String(err) } });
    } finally {
      updateCard(provider, { ativando: false });
    }
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-16">
      <header className="mb-10">
        <p className="mb-1 text-[13px] text-text-secondary">Kyvo</p>
        <h1 className="mb-2 text-[28px] font-semibold tracking-tight text-text-primary">Provedor de IA</h1>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-text-secondary">
          Escolha qual modelo responde às mensagens do assistente. A troca vale para a próxima mensagem, sem
          precisar reiniciar nada.
        </p>
      </header>

      {erroCarregamento && <p className="text-sm text-text-secondary">Falha ao carregar: {erroCarregamento}</p>}
      {!provedores && !erroCarregamento && <p className="text-sm text-text-secondary">Carregando…</p>}

      {provedores && (
        <div className="flex flex-col gap-4">
          {provedores.map((p) => {
            const state = cardState[p.provider];
            if (!state) return null;
            return (
              <ProviderCard
                key={p.provider}
                resumo={p}
                state={state}
                onModeloChange={(modelo) => updateCard(p.provider, { modelo })}
                onApiKeyChange={(apiKey) => updateCard(p.provider, { apiKey })}
                onSalvar={() => handleSalvar(p.provider)}
                onTestar={() => handleTestar(p.provider)}
                onAtivar={() => handleAtivar(p.provider)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  resumo,
  state,
  onModeloChange,
  onApiKeyChange,
  onSalvar,
  onTestar,
  onAtivar,
}: {
  resumo: ProvedorResumo;
  state: ProviderCardState;
  onModeloChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onSalvar: () => void;
  onTestar: () => void;
  onAtivar: () => void;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-text-primary">
          {NOME_PROVIDER[resumo.provider] ?? resumo.provider}
        </h2>
        {resumo.ativo ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-accent-contrast">
            <CheckCircle size={14} weight="fill" /> Ativo
          </span>
        ) : resumo.chaveConfigurada ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">
            <CircleDashed size={14} /> Configurado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger">
            <WarningCircle size={14} weight="fill" /> Sem chave
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor={`${resumo.provider}-modelo`} className="text-[13px] font-medium text-text-secondary">
          Modelo
        </label>
        <input
          id={`${resumo.provider}-modelo`}
          type="text"
          value={state.modelo}
          onChange={(e) => onModeloChange(e.target.value)}
          className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-sm text-text-primary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
      </div>

      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor={`${resumo.provider}-key`} className="text-[13px] font-medium text-text-secondary">
          API key
        </label>
        <input
          id={`${resumo.provider}-key`}
          type="password"
          autoComplete="off"
          value={state.apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={resumo.chaveConfigurada ? "•••••••••••••• (deixe em branco para manter)" : "cole a API key aqui"}
          className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary placeholder:opacity-70 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
        <span className="text-xs text-text-secondary">A chave nunca é exibida de volta depois de salva.</span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-text-primary transition hover:bg-surface-sunken active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onSalvar}
          disabled={state.salvando}
        >
          {state.salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          className="rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-text-primary transition hover:bg-surface-sunken active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onTestar}
          disabled={state.testando || !resumo.chaveConfigurada}
        >
          {state.testando ? "Testando…" : "Testar conexão"}
        </button>
        <button
          className="rounded-lg border border-accent bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-contrast transition hover:brightness-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onAtivar}
          disabled={state.ativando || resumo.ativo || !resumo.chaveConfigurada}
        >
          {resumo.ativo ? "Ativo" : state.ativando ? "Ativando…" : "Ativar"}
        </button>
      </div>

      {state.status && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${
            state.status.tipo === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {state.status.texto}
        </p>
      )}
    </section>
  );
}
