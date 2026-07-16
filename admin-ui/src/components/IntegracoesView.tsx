import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { obterIntegracoes, type IntegracoesStatus } from "../api";

export function IntegracoesView() {
  const [status, setStatus] = useState<IntegracoesStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    obterIntegracoes()
      .then(setStatus)
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="px-5 py-5">
      <p className="mb-5 text-sm leading-relaxed text-text-secondary">
        Outras integrações configuradas por variável de ambiente no servidor, sem chave editável por aqui.
      </p>

      {erro && <p className="text-sm text-danger">Falha ao carregar: {erro}</p>}
      {!status && !erro && <p className="text-sm text-text-secondary">Carregando…</p>}

      {status && (
        <div className="flex flex-col gap-3">
          <LinhaIntegracao
            nome="Transcrição de áudio (Groq/Whisper)"
            descricao="Converte áudios recebidos no Telegram em texto antes de chegar ao agente."
            configurado={status.groqConfigurado}
          />
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

function LinhaIntegracao({ nome, descricao, configurado }: { nome: string; descricao: string; configurado: boolean }) {
  return (
    <section className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface p-5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text-primary">{nome}</h3>
        <p className="mt-0.5 text-[13px] text-text-secondary">{descricao}</p>
      </div>
      {configurado ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-accent-contrast">
          <CheckCircle size={14} weight="fill" /> Configurado
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">
          <WarningCircle size={14} /> Não configurado
        </span>
      )}
    </section>
  );
}
