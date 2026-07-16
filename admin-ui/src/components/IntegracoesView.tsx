import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import {
  obterConfigGroq,
  obterIntegracoes,
  salvarConfigGroq,
  type GroqConfigResumo,
  type IntegracoesStatus,
} from "../api";

export function IntegracoesView() {
  const [status, setStatus] = useState<IntegracoesStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    obterIntegracoes()
      .then(setStatus)
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="px-[30px] py-[26px]">
      <p className="mb-1 text-base font-bold tracking-tight text-text-primary">Integrações</p>
      <p className="mb-5 text-[13px] leading-relaxed text-text-secondary">
        Conexões com serviços externos usados pelo agente.
      </p>

      <GroqConfigCard />

      {erro && <p className="text-sm text-danger">Falha ao carregar: {erro}</p>}
      {!status && !erro && <p className="text-sm text-text-secondary">Carregando…</p>}

      {status && (
        <div className="mt-4 flex flex-col gap-2.5">
          <LinhaIntegracao
            nome="Open Finance (Pluggy)"
            descricao="Conexão com contas e instituições financeiras — fase 2 do produto."
            configurado={status.pluggyConfigurado}
          />
        </div>
      )}
    </div>
  );
}

function GroqConfigCard() {
  const [config, setConfig] = useState<GroqConfigResumo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregar() {
    try {
      setConfig(await obterConfigGroq());
    } catch (err) {
      setStatusMsg({ tipo: "erro", texto: err instanceof Error ? err.message : String(err) });
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);
    setStatusMsg(null);
    try {
      await salvarConfigGroq(apiKey);
      setApiKey("");
      setStatusMsg({ tipo: "ok", texto: "Salvo." });
      await carregar();
    } catch (err) {
      setStatusMsg({ tipo: "erro", texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-glass-strong p-4">
      <div className="mb-4 flex items-center gap-3.5">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-input-bg text-[13px] font-bold text-text-secondary">
          G
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13.5px] font-bold text-text-primary">Transcrição de áudio (Groq/Whisper)</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Converte áudios recebidos no Telegram em texto antes de chegar ao agente.
          </p>
        </div>
        {config?.apiKeyConfigurada ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-contrast">
            <CheckCircle size={14} weight="fill" /> Configurado
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger">
            <WarningCircle size={14} weight="fill" /> Sem chave
          </span>
        )}
      </div>

      <div className="mb-3.5 flex flex-col gap-1">
        <label htmlFor="groq-key" className="text-[12.5px] font-semibold text-text-secondary">
          API key
        </label>
        <input
          id="groq-key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            config?.apiKeyConfigurada ? "•••••••••••••• (deixe em branco para manter)" : "cole a API key aqui"
          }
          className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
        <span className="text-xs text-text-tertiary">A chave nunca é exibida de volta depois de salva.</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-contrast transition hover:brightness-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSalvar}
          disabled={salvando || !apiKey}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {statusMsg && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${
            statusMsg.tipo === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {statusMsg.texto}
        </p>
      )}
    </section>
  );
}

function LinhaIntegracao({ nome, descricao, configurado }: { nome: string; descricao: string; configurado: boolean }) {
  return (
    <section className="flex items-center gap-3.5 rounded-2xl border border-border-subtle bg-glass-strong p-4">
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-input-bg text-[13px] font-bold text-text-secondary">
        {nome.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold text-text-primary">{nome}</h3>
        <p className="mt-0.5 text-xs text-text-secondary">{descricao}</p>
      </div>
      {configurado ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-contrast">
          <CheckCircle size={14} weight="fill" /> Configurado
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-input-bg px-2.5 py-1 text-[11px] font-bold text-text-secondary">
          <WarningCircle size={14} /> Não configurado
        </span>
      )}
    </section>
  );
}
