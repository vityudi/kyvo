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
    <div className="px-[30px] py-[26px]">
      <p className="mb-1 text-base font-bold tracking-tight text-text-primary">Integrações</p>
      <p className="mb-5 text-[13px] leading-relaxed text-text-secondary">
        Outras integrações configuradas por variável de ambiente no servidor, sem chave editável por aqui.
      </p>

      {erro && <p className="text-sm text-danger">Falha ao carregar: {erro}</p>}
      {!status && !erro && <p className="text-sm text-text-secondary">Carregando…</p>}

      {status && (
        <div className="flex flex-col gap-2.5">
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
