import { useEffect, useState } from "react";
import { ArrowClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
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
    <div className="px-5 py-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-text-secondary">
          Status da conexão do bot com a Bot API do Telegram e do webhook configurado. O token e o segredo do webhook
          são definidos via variáveis de ambiente do servidor.
        </p>
        <button
          onClick={carregar}
          disabled={carregando}
          title="Atualizar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition hover:bg-surface-sunken disabled:opacity-50"
        >
          <ArrowClockwise size={15} className={carregando ? "animate-spin" : ""} />
        </button>
      </div>

      {erro && <p className="text-sm text-danger">Falha ao carregar: {erro}</p>}
      {!status && !erro && <p className="text-sm text-text-secondary">Carregando…</p>}

      {status && (
        <section className="rounded-card border border-border bg-surface p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-text-primary">Bot do Telegram</h2>
            {status.conectado ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-accent-contrast">
                <CheckCircle size={14} weight="fill" /> Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger">
                <WarningCircle size={14} weight="fill" /> Desconectado
              </span>
            )}
          </div>

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
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <dt className="text-text-secondary">{rotulo}</dt>
      <dd className="truncate font-medium text-text-primary">{valor}</dd>
    </div>
  );
}
