import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { obterStatusTelegram, type TelegramStatus } from "../api";

export function TelegramStatusView() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const resultado = await obterStatusTelegram();
      setStatus(resultado);
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="px-[30px] py-[26px]">
      <p className="mb-1 text-base font-bold tracking-tight text-text-primary">Telegram</p>
      <div className="mb-5 flex items-start justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-text-secondary">
          Status da conexão do bot com a Bot API do Telegram e do webhook configurado. O token e o segredo do webhook
          são definidos via variáveis de ambiente do servidor.
        </p>
        <button
          onClick={carregar}
          disabled={carregando}
          title="Atualizar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-text-secondary transition hover:bg-glass-strong disabled:opacity-50"
        >
          <ArrowClockwise size={15} className={carregando ? "animate-spin" : ""} />
        </button>
      </div>

      {erro && <p className="text-sm text-danger">Falha ao carregar: {erro}</p>}
      {!status && !erro && <p className="text-sm text-text-secondary">Carregando…</p>}

      {status && (
        <section className="rounded-2xl border border-border-subtle bg-glass-strong p-5">
          <div className="mb-4 flex items-center gap-3">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={
                status.conectado
                  ? { background: "var(--accent)", boxShadow: "0 0 0 4px var(--accent-soft)" }
                  : { background: "var(--danger)" }
              }
            />
            <p className="text-sm font-bold text-text-primary">{status.conectado ? "Conectado" : "Desconectado"}</p>
            {status.conectado && status.botUsername && (
              <span className="ml-auto font-mono text-[12.5px] text-text-secondary">@{status.botUsername}</span>
            )}
          </div>
          <div className="mb-4 h-px bg-border-subtle" />

          {status.conectado ? (
            <dl className="flex flex-col gap-3 text-sm">
              <Campo rotulo="Bot" valor={status.botUsername ? `@${status.botUsername}` : status.botNome ?? "—"} />
              <Campo rotulo="ID do bot" valor={status.botId != null ? String(status.botId) : "—"} />
              <Campo rotulo="Webhook" valor={status.webhookUrl ?? "não configurado"} />
              <Campo
                rotulo="Segredo do webhook"
                valor={status.webhookSecretConfigurado ? "configurado" : "não configurado"}
              />
              {status.ultimoErroWebhook && (
                <div className="mt-1 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
                  Último erro reportado pelo Telegram: {status.ultimoErroWebhook}
                </div>
              )}
            </dl>
          ) : (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {status.erro ?? "Não foi possível conectar com a Bot API do Telegram. Confira TELEGRAM_BOT_TOKEN."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
      <dt className="text-text-secondary">{rotulo}</dt>
      <dd className="truncate font-semibold text-text-primary">{valor}</dd>
    </div>
  );
}
