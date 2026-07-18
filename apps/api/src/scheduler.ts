import cron from "node-cron";
import { metasComPrazoProximo, orcamentosEstourados, tentarRegistrarAlerta } from "./db/alertas.js";
import { detectarAnomalias } from "./db/anomalias.js";
import { dispararLembretesVencidos } from "./db/lembrete.js";
import { existeInsightNoPeriodo, registrarInsight } from "./db/memoriaInsight.js";
import { resumoPeriodo } from "./db/transacao.js";
import { listarTodosUsuarios } from "./db/usuario.js";
import { gerarExplicacaoAnomalia, gerarResumoMensal } from "./lib/insightGenerator.js";
import { logger } from "./lib/logger.js";
import { sendTelegramMessage } from "./lib/telegram.js";

/**
 * Tarefas agendadas (cron) que nao sao reacao direta a uma mensagem do
 * usuario - alertas proativos de orcamento/meta, lembretes e a consolidacao
 * periodica de memoria/insights (docs/RAG_MEMORY_ARCHITECTURE.md, secao 5).
 * Roda dentro do mesmo processo do servidor HTTP (ver src/server.ts).
 */

function primeiroDiaMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`;
}

function ultimoDiaMes(data: Date): string {
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
}

/** Alertas de orcamento estourado e meta com prazo proximo - deterministas, sem Claude. */
async function verificarAlertas(): Promise<void> {
  const usuarios = await listarTodosUsuarios();
  const mesAtual = primeiroDiaMes(new Date());

  for (const usuario of usuarios) {
    for (const orcamento of await orcamentosEstourados(usuario.id)) {
      const novo = await tentarRegistrarAlerta(usuario.id, "orcamento_estourado", orcamento.categoria, mesAtual);
      if (!novo) continue;

      await sendTelegramMessage(
        usuario.telegram_chat_id,
        `Seu orçamento de "${orcamento.categoria}" para este mês (R$ ${orcamento.valor_limite.toFixed(2)}) já foi atingido - você gastou R$ ${orcamento.gasto_mes.toFixed(2)} até agora.`,
      );
    }

    for (const meta of await metasComPrazoProximo(usuario.id)) {
      const novo = await tentarRegistrarAlerta(usuario.id, "meta_prazo_proximo", meta.id, meta.prazo);
      if (!novo) continue;

      const faltam = meta.valor_alvo - meta.valor_atual;
      await sendTelegramMessage(
        usuario.telegram_chat_id,
        `Sua meta "${meta.nome}" tem prazo em ${meta.prazo} e ainda falta R$ ${faltam.toFixed(2)} para chegar nos R$ ${meta.valor_alvo.toFixed(2)}.`,
      );
    }
  }

  logger.info({ usuarios: usuarios.length }, "[scheduler] verificacao de alertas concluida");
}

/** Dispara lembretes vencidos via Telegram - best-effort, sem retry (mesmo espirito de verificarAlertas). */
async function dispararLembretes(): Promise<void> {
  const lembretes = await dispararLembretesVencidos();

  for (const lembrete of lembretes) {
    try {
      await sendTelegramMessage(lembrete.telegram_chat_id, `Lembrete: ${lembrete.descricao}`);
    } catch (err) {
      logger.error({ err, lembreteId: lembrete.id }, "[scheduler] falha ao enviar lembrete");
    }
  }

  if (lembretes.length) {
    logger.info({ enviados: lembretes.length }, "[scheduler] lembretes disparados");
  }
}

/**
 * Deteccao de anomalia (SQL puro) + resumo mensal qualitativo (Claude) -
 * RAG_MEMORY_ARCHITECTURE.md, secao 5. Roda diariamente; o dedupe contra
 * memoria_insight existente torna seguro rodar mais de uma vez no mesmo dia
 * ou mes.
 */
async function consolidarMemoria(): Promise<void> {
  const usuarios = await listarTodosUsuarios();
  const hoje = new Date();
  const mesAtual = primeiroDiaMes(hoje);

  const mesAnteriorData = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesAnterior = primeiroDiaMes(mesAnteriorData);
  const fimMesAnterior = ultimoDiaMes(mesAnteriorData);
  const nomeMesAnterior = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mesAnteriorData);

  for (const usuario of usuarios) {
    for (const anomalia of await detectarAnomalias(usuario.id)) {
      if (await existeInsightNoPeriodo(usuario.id, "anomalia", mesAtual, anomalia.categoria)) continue;

      const conteudo = await gerarExplicacaoAnomalia({
        categoria: anomalia.categoria,
        valorMes: anomalia.valor_mes,
        mediaAnterior: anomalia.media_anterior,
        variacaoPercentual: anomalia.variacao_percentual,
      });

      await registrarInsight(usuario.id, {
        tipo: "anomalia",
        conteudo,
        periodoReferencia: mesAtual,
        metadata: {
          categoria: anomalia.categoria,
          valor_mes: anomalia.valor_mes,
          media_anterior: anomalia.media_anterior,
          variacao_percentual: anomalia.variacao_percentual,
        },
        origem: "worker",
      });
    }

    if (!(await existeInsightNoPeriodo(usuario.id, "resumo_mensal", mesAnterior))) {
      const resumo = await resumoPeriodo(usuario.id, {
        data_inicio: mesAnterior,
        data_fim: fimMesAnterior,
        agrupar_por: "categoria",
        comparar_periodo_anterior: false,
      });

      const conteudo = await gerarResumoMensal(resumo, nomeMesAnterior);

      await registrarInsight(usuario.id, {
        tipo: "resumo_mensal",
        conteudo,
        periodoReferencia: mesAnterior,
        metadata: { ...resumo },
        origem: "worker",
      });
    }
  }

  logger.info({ usuarios: usuarios.length }, "[scheduler] consolidacao de memoria concluida");
}

/** Registra os cron jobs no processo atual. Chamado uma vez a partir de src/server.ts. */
export function iniciarScheduler(): void {
  cron.schedule("0 * * * *", () => {
    verificarAlertas().catch((err) => logger.error(err, "[scheduler] falha na verificacao de alertas"));
  });

  cron.schedule("* * * * *", () => {
    dispararLembretes().catch((err) => logger.error(err, "[scheduler] falha ao disparar lembretes"));
  });

  cron.schedule("0 6 * * *", () => {
    consolidarMemoria().catch((err) => logger.error(err, "[scheduler] falha na consolidacao de memoria"));
  });

  logger.info("scheduler iniciado - agendamentos ativos");
}
