import { useEffect, useState } from "react";
import { CheckCircle, CircleDashed, WarningCircle } from "@phosphor-icons/react";
import { ativarProvedor, listarProvedores, salvarProvedor, testarProvedor, type ProvedorResumo } from "./api";

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

export function App() {
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
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Kyvo</p>
        <h1>Provedor de IA</h1>
        <p>Escolha qual modelo responde às mensagens do assistente. A troca vale para a próxima mensagem, sem precisar reiniciar nada.</p>
      </header>

      {erroCarregamento && <p className="page-error">Falha ao carregar: {erroCarregamento}</p>}
      {!provedores && !erroCarregamento && <p className="page-loading">Carregando…</p>}

      {provedores && (
        <div className="provider-list">
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
    <section className="provider-card">
      <div className="provider-card-head">
        <div className="provider-title">
          <h2>{NOME_PROVIDER[resumo.provider] ?? resumo.provider}</h2>
        </div>
        {resumo.ativo ? (
          <span className="badge badge-active">
            <CheckCircle size={14} weight="fill" /> Ativo
          </span>
        ) : resumo.chaveConfigurada ? (
          <span className="badge">
            <CircleDashed size={14} /> Configurado
          </span>
        ) : (
          <span className="badge badge-missing">
            <WarningCircle size={14} weight="fill" /> Sem chave
          </span>
        )}
      </div>

      <div className="field-group">
        <label htmlFor={`${resumo.provider}-modelo`}>Modelo</label>
        <input
          id={`${resumo.provider}-modelo`}
          type="text"
          value={state.modelo}
          onChange={(e) => onModeloChange(e.target.value)}
        />
      </div>

      <div className="field-group">
        <label htmlFor={`${resumo.provider}-key`}>API key</label>
        <input
          id={`${resumo.provider}-key`}
          type="password"
          autoComplete="off"
          value={state.apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={resumo.chaveConfigurada ? "•••••••••••••• (deixe em branco para manter)" : "cole a API key aqui"}
        />
        <span className="field-hint">A chave nunca é exibida de volta depois de salva.</span>
      </div>

      <div className="card-actions">
        <button className="btn" onClick={onSalvar} disabled={state.salvando}>
          {state.salvando ? "Salvando…" : "Salvar"}
        </button>
        <button className="btn" onClick={onTestar} disabled={state.testando || !resumo.chaveConfigurada}>
          {state.testando ? "Testando…" : "Testar conexão"}
        </button>
        <button
          className="btn btn-primary"
          onClick={onAtivar}
          disabled={state.ativando || resumo.ativo || !resumo.chaveConfigurada}
        >
          {resumo.ativo ? "Ativo" : state.ativando ? "Ativando…" : "Ativar"}
        </button>
      </div>

      {state.status && (
        <p className={`status-line status-${state.status.tipo}`}>{state.status.texto}</p>
      )}
    </section>
  );
}
