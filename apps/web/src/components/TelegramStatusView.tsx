import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import {
  obterConfigTelegram,
  obterStatusTelegram,
  registrarWebhookTelegram,
  salvarConfigTelegram,
  type TelegramConfigResumo,
  type TelegramStatus,
} from "../api";

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
          Configure o bot e o webhook direto aqui, e acompanhe o status da conexão com a Bot API do Telegram.
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

      <TelegramConfigForm onSalvo={carregar} />

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
              {status.erro ?? "Não foi possível conectar com a Bot API do Telegram. Confira o bot token abaixo."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function TelegramConfigForm({ onSalvo }: { onSalvo: () => void }) {
  const [config, setConfig] = useState<TelegramConfigResumo | null>(null);
  const [botToken, setBotToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [ownerChatId, setOwnerChatId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregarConfig() {
    try {
      const resultado = await obterConfigTelegram();
      setConfig(resultado);
      setOwnerChatId(resultado.ownerChatId != null ? String(resultado.ownerChatId) : "");
    } catch {
      // status geral ja mostra o erro de carregamento acima
    }
  }

  useEffect(() => {
    carregarConfig();
  }, []);

  async function handleSalvar() {
    setSalvando(true);
    setStatusMsg(null);
    try {
      const ownerChatIdValor = ownerChatId.trim() ? Number(ownerChatId.trim()) : null;
      await salvarConfigTelegram(botToken, webhookSecret, ownerChatIdValor);
      setBotToken("");
      setWebhookSecret("");
      setStatusMsg({ tipo: "ok", texto: "Configuração salva." });
      await carregarConfig();
      onSalvo();
    } catch (err) {
      setStatusMsg({ tipo: "erro", texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvando(false);
    }
  }

  async function handleRegistrarWebhook() {
    setRegistrando(true);
    setStatusMsg(null);
    const resultado = await registrarWebhookTelegram(webhookUrl);
    setStatusMsg(
      resultado.ok
        ? { tipo: "ok", texto: "Webhook registrado no Telegram." }
        : { tipo: "erro", texto: resultado.erro },
    );
    setRegistrando(false);
    if (resultado.ok) onSalvo();
  }

  return (
    <section className="mb-5 rounded-2xl border border-border-subtle bg-glass-strong p-5">
      <div className="mb-3.5 flex flex-col gap-1">
        <label htmlFor="telegram-bot-token" className="text-[12.5px] font-semibold text-text-secondary">
          Bot token
        </label>
        <input
          id="telegram-bot-token"
          type="password"
          autoComplete="new-password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder={
            config?.botTokenConfigurado ? "•••••••••••••• (deixe em branco para manter)" : "cole o token do @BotFather"
          }
          className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
      </div>

      <div className="mb-3.5 flex flex-col gap-1">
        <label htmlFor="telegram-webhook-secret" className="text-[12.5px] font-semibold text-text-secondary">
          Segredo do webhook (opcional, recomendado)
        </label>
        <input
          id="telegram-webhook-secret"
          type="password"
          autoComplete="new-password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={
            config?.webhookSecretConfigurado
              ? "•••••••••••••• (deixe em branco para manter)"
              : "qualquer string aleatoria"
          }
          className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
      </div>

      <div className="mb-3.5 flex flex-col gap-1">
        <label htmlFor="telegram-owner-chat-id" className="text-[12.5px] font-semibold text-text-secondary">
          Chat autorizado
        </label>
        <input
          id="telegram-owner-chat-id"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={ownerChatId}
          onChange={(e) => setOwnerChatId(e.target.value)}
          placeholder="ex.: 123456789"
          className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
        <p className="text-xs text-text-tertiary">
          O bot só responde para esse chat_id do Telegram - qualquer outro recebe uma mensagem educada de
          recusa, sem gastar tokens de IA e sem criar conta. Enquanto este campo estiver vazio, ninguém
          recebe resposta, nem você. Para descobrir seu próprio chat_id na primeira configuração, mande uma
          mensagem para o bot e confira o log do servidor (ele registra o chat_id de toda tentativa recebida).
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-contrast transition hover:brightness-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSalvar}
          disabled={salvando || (!botToken && !webhookSecret && ownerChatId === (config?.ownerChatId != null ? String(config.ownerChatId) : ""))}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>

      <div className="mb-1 h-px bg-border-subtle" />

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="telegram-webhook-url" className="text-[12.5px] font-semibold text-text-secondary">
          Registrar webhook
        </label>
        <p className="mb-1 text-xs text-text-tertiary">
          Cole a URL pública que aponta para este servidor (ex.: a URL de um túnel ngrok/cloudflared) - o caminho{" "}
          <code>/webhook/telegram</code> é completado automaticamente se você colar só o domínio.
        </p>
        <div className="flex gap-2">
          <input
            id="telegram-webhook-url"
            type="text"
            autoComplete="off"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://xxxx.ngrok-free.app"
            className="flex-1 rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
          />
          <button
            className="shrink-0 rounded-[10px] border border-border-subtle bg-glass px-4 py-2.5 text-[12.5px] font-semibold text-text-primary transition hover:bg-glass-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleRegistrarWebhook}
            disabled={registrando || !webhookUrl || !config?.botTokenConfigurado}
          >
            {registrando ? "Registrando…" : "Registrar"}
          </button>
        </div>
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

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
      <dt className="text-text-secondary">{rotulo}</dt>
      <dd className="truncate font-semibold text-text-primary">{valor}</dd>
    </div>
  );
}
