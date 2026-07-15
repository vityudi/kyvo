import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

/**
 * Cliente singleton do Claude. A leitura da API key ja e validada em
 * config/env.ts - aqui so construimos o client.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const DEFAULT_MODEL = env.ANTHROPIC_MODEL;

/**
 * TODO (Fase 0): implementar o loop de agente com tool use.
 *
 * As tools da Fase 0/1 (registrar_gasto, registrar_receita,
 * consultar_transacoes, criar_meta, etc.) estao especificadas com JSON
 * schema completo em docs/TOOLS_FASE_0_1.md, no repositorio de planejamento.
 * Este arquivo e o ponto de entrada natural para essa implementacao: montar
 * o system prompt (core memory - preferencias/metas/orcamentos), declarar as
 * tools e rodar o loop ate a resposta final, executando cada tool_use contra
 * o Postgres (ver src/db/pool.ts).
 */
