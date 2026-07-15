import type Anthropic from "@anthropic-ai/sdk";
import { listarCategorias } from "../db/categoria.js";
import { listarMetasAtivas } from "../db/meta.js";
import { carregarHistorico, salvarTurno } from "../db/mensagem.js";
import { listarOrcamentos } from "../db/orcamento.js";
import { obterPerfil } from "../db/perfilUsuario.js";
import { listarRegras } from "../db/regraCategorizacao.js";
import { anthropic, DEFAULT_MODEL } from "./anthropic.js";
import { logger } from "./logger.js";
import { executeTool, toolDefinitions } from "./tools.js";

const MAX_TOOL_ITERATIONS = 6;
const MAX_TOKENS = 1024;

/**
 * Monta o "core memory" (FOUNDATION.md, secao 4.2, opcao 2): categorias
 * conhecidas, orcamentos e metas ativas, e regras de categorizacao,
 * injetados no system prompt a cada conversa - nunca a IA "lembrando"
 * sozinha desses dados.
 */
async function buildSystemPrompt(usuarioId: string): Promise<string> {
  const [categoriasDespesa, categoriasReceita, orcamentos, metas, regras] = await Promise.all([
    listarCategorias(usuarioId, "despesa"),
    listarCategorias(usuarioId, "receita"),
    listarOrcamentos(usuarioId),
    listarMetasAtivas(usuarioId),
    listarRegras(usuarioId),
  ]);

  const linhasOrcamentos = orcamentos.length
    ? orcamentos.map((o) => `- ${o.categoria}: limite de R$ ${o.valor_limite.toFixed(2)}/mes`).join("\n")
    : "- nenhum orcamento definido ainda";

  const linhasMetas = metas.length
    ? metas
        .map(
          (m) =>
            `- ${m.nome}: R$ ${m.valor_atual.toFixed(2)} de R$ ${m.valor_alvo.toFixed(2)}` +
            (m.prazo ? ` (prazo: ${m.prazo})` : ""),
        )
        .join("\n")
    : "- nenhuma meta ativa ainda";

  const linhasRegras = regras.length
    ? regras.map((r) => `- descricoes contendo "${r.padrao_texto}" -> categoria "${r.categoria}"`).join("\n")
    : "- nenhuma regra definida ainda";

  const blocoMemoriaRag = await buildBlocoMemoriaRag(usuarioId);

  return `Voce e o Kyvo, um assistente financeiro pessoal que conversa em portugues do Brasil, \
de forma direta e amigavel, como um amigo que entende de financas.

Principios inegociaveis:
- Voce NUNCA e a fonte de verdade sobre saldo, historico de transacoes, orcamentos ou metas. \
Sempre consulte via tool (consultar_transacoes, resumo_periodo, consultar_saldo) antes de \
afirmar qualquer numero - nunca invente ou estime um valor.
- So chame uma tool de registro (registrar_gasto, registrar_receita) depois de ja ter decidido, \
com confianca, os campos necessarios. Se o valor ou a categoria estiverem ambiguos, pergunte ao \
usuario antes de registrar, em vez de adivinhar.
- Use exatamente os nomes de categoria conhecidos abaixo (sem acento, como estao listados). Se \
nenhuma categoria fizer sentido, use "outros".
- Respostas curtas e naturais de chat - sem markdown pesado, sem listas longas desnecessarias.

Categorias de despesa conhecidas: ${categoriasDespesa.join(", ")}
Categorias de receita conhecidas: ${categoriasReceita.join(", ")}

Orcamentos ativos do usuario:
${linhasOrcamentos}

Metas ativas do usuario:
${linhasMetas}

Regras de categorizacao aprendidas:
${linhasRegras}${blocoMemoriaRag}`;
}

/**
 * Bloco de perfil pessoal + instrucoes de "modo conselheiro" e guardrails de
 * privacidade (RAG_MEMORY_ARCHITECTURE.md, secoes 3.2b, 3.7 e 4).
 */
async function buildBlocoMemoriaRag(usuarioId: string): Promise<string> {
  const perfil = await obterPerfil(usuarioId);
  const linhasPerfil = Object.keys(perfil).length
    ? Object.entries(perfil)
        .map(([atributo, valor]) => `- ${atributo}: ${valor}`)
        .join("\n")
    : "- nenhum fato de perfil registrado ainda";

  return `

Perfil pessoal conhecido do usuario (fatos estaveis de vida - use para moldar o tom e a \
prioridade das suas sugestoes, nao precisa citar explicitamente toda vez):
${linhasPerfil}

Modo conselheiro - quando o usuario pedir um conselho ou sugestao proativa (nao so uma consulta \
de dado), voce DEVE, antes de responder, combinar: (1) o perfil pessoal acima, (2) \
buscar_insights_usuario(tipo=contexto_pessoal) para contexto narrativo relevante, (3) \
buscar_principios_financeiros para fundamentar com um framework curado, e (4) \
consultar_transacoes/resumo_periodo para os numeros reais do usuario. Nunca de um conselho \
generico sem cruzar com a situacao real da pessoa.

Voce tambem pode usar registrar_contexto_pessoal (fatos narrativos ainda nao estaveis) e \
atualizar_perfil (fatos estaveis/confirmados) proativamente quando o usuario revelar algo \
relevante sobre a vida pessoal dele, e registrar_decisao quando ele verbalizar uma intencao \
financeira ("vou tentar cortar Uber esse mes").

Guardrail de privacidade - NUNCA registre como contexto pessoal: saude fisica ou mental, vida \
sexual ou orientacao sexual, convicção ou pratica religiosa, opiniao politica, origem racial ou \
etnica, dado genetico ou biometrico, detalhes pessoais sobre terceiros (filhos/conjuge/amigos) \
alem do que afeta objetivamente o orcamento do usuario, ou detalhes de processos judiciais (so o \
fato financeiro objetivo, nunca o motivo). Na duvida se algo deve ser registrado, NAO registre. \
Se o usuario pedir para esquecer ou apagar algo que ja foi registrado, atenda de imediato via \
esquecer_contexto_pessoal (busque com buscar_insights_usuario primeiro se precisar do id) - sem \
perguntar o motivo.`;
}

function extrairTexto(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();
}

/**
 * Roda o loop de agente (mensagem -> tool_use -> tool_result -> ...) ate o
 * modelo parar de chamar tools, persiste o turno final em `mensagem` e
 * retorna o texto de resposta a ser enviado ao usuario.
 */
export async function processarMensagem(usuarioId: string, textoUsuario: string): Promise<string> {
  const [systemPrompt, historico] = await Promise.all([
    buildSystemPrompt(usuarioId),
    carregarHistorico(usuarioId),
  ]);

  const messages: Anthropic.MessageParam[] = [
    ...historico.map((turno): Anthropic.MessageParam => ({ role: turno.role, content: turno.conteudo })),
    { role: "user", content: textoUsuario },
  ];

  let textoResposta = "";

  for (let iteracao = 0; iteracao < MAX_TOOL_ITERATIONS; iteracao++) {
    const resposta = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    messages.push({ role: "assistant", content: resposta.content });

    if (resposta.stop_reason !== "tool_use") {
      textoResposta = extrairTexto(resposta.content);
      break;
    }

    const toolUses = resposta.content.filter((bloco): bloco is Anthropic.ToolUseBlock => bloco.type === "tool_use");

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const resultado = await executeTool(toolUse.name, toolUse.input, usuarioId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: resultado.conteudo,
        is_error: resultado.ehErro,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (!textoResposta) {
    logger.warn({ usuarioId }, "loop do agente atingiu o limite de iteracoes sem resposta final");
    textoResposta =
      "Desculpa, me perdi tentando processar isso. Pode tentar reformular a mensagem?";
  }

  await salvarTurno(usuarioId, textoUsuario, textoResposta);

  return textoResposta;
}
