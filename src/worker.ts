import cron from "node-cron";
import { metasComPrazoProximo, orcamentosEstourados, tentarRegistrarAlerta } from "./db/alertas.js";
import { detectarAnomalias } from "./db/anomalias.js";
import { runMigrations } from "./db/migrate.js";
import { existeInsightNoPeriodo, registrarInsight } from "./db/memoriaInsight.js";
import { pool } from "./db/pool.js";
import { resumoPeriodo } from "./db/transacao.js";
import { listarTodosUsuarios } from "./db/usuario.js";
import { gerarExplicacaoAnomalia, gerarResumoMensal } from "./lib/insightGenerator.js";
import { logger } from "./lib/logger.js";
import { sendTelegramMessage } from "./lib/telegram.js";

/**
 * Processo separado do servidor web (ver docs/FOUNDATION.md, secao 3): roda
 * as tarefas que nao sao reacao direta a uma mensagem do usuario - alertas
 * proativos de orcamento/meta, e a consolidacao periodica de memoria/insights
 * (docs/RAG_MEMORY_ARCHITECTURE.md, secao 5).
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

  logger.info({ usuarios: usuarios.length }, "[worker] verificacao de alertas concluida");
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

  logger.info({ usuarios: usuarios.length }, "[worker] consolidacao de memoria concluida");
}

async function main(): Promise<void> {
  await runMigrations();

  cron.schedule("0 * * * *", () => {
    verificarAlertas().catch((err) => logger.error(err, "[worker] falha na verificacao de alertas"));
  });

  cron.schedule("0 6 * * *", () => {
    consolidarMemoria().catch((err) => logger.error(err, "[worker] falha na consolidacao de memoria"));
  });

  logger.info("worker iniciado - agendamentos ativos");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info({ signal }, "encerrando worker");
      await pool.end();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error(err, "falha ao iniciar o worker");
  process.exit(1);
});
