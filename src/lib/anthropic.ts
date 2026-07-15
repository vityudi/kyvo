import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

/**
 * Cliente singleton do Claude. A leitura da API key ja e validada em
 * config/env.ts - aqui so construimos o client.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const DEFAULT_MODEL = env.ANTHROPIC_MODEL;
