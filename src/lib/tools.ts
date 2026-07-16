import { buscarPrincipios } from "../db/baseConhecimento.js";
import { criarOuAtualizarOrcamento } from "../db/orcamento.js";
import { atualizarMeta, criarMeta } from "../db/meta.js";
import { buscarInsights, excluirInsight, registrarInsight } from "../db/memoriaInsight.js";
import { atualizarAtributoPerfil } from "../db/perfilUsuario.js";
import { definirRegraCategorizacao } from "../db/regraCategorizacao.js";
import {
  consultarSaldo,
  consultarTransacoes,
  editarTransacao,
  excluirTransacao,
  registrarDespesa,
  registrarReceita,
  resumoPeriodo,
} from "../db/transacao.js";
import { logger } from "./logger.js";
import type { ToolDefinition } from "./llm/types.js";

/**
 * As 11 tools de Fase 0/1 especificadas em docs/TOOLS_FASE_0_1.md, com o
 * JSON schema traduzido 1:1 dos exemplos do documento. `usuario_id` nunca
 * aparece como parametro (principio 1 do documento) - o backend injeta a
 * partir da sessao de chat antes de chamar `executeTool`.
 */
const baseToolDefinitions: ToolDefinition[] = [
  {
    name: "registrar_gasto",
    description:
      "Registra uma despesa (dinheiro que saiu) informada pelo usuario em linguagem natural. Só chame esta tool depois de já ter decidido, com confiança, o valor e a categoria — se algo estiver ambíguo (valor não claro, categoria não óbvia), pergunte ao usuário antes de chamar esta tool em vez de adivinhar. Exemplos que devem chamar esta tool: 'gastei 47 reais no ifood', 'paguei 1200 de aluguel', 'comprei um presente de 80 reais'.",
    input_schema: {
      type: "object",
      properties: {
        valor: { type: "number", exclusiveMinimum: 0, description: "Valor da despesa em reais (BRL), ex.: 47.90" },
        categoria: {
          type: "string",
          description:
            "Categoria da despesa. Deve corresponder a uma categoria já conhecida do usuário (ver lista no system prompt); use 'outros' se não tiver certeza.",
        },
        descricao: { type: "string", description: "Descrição curta do gasto, ex.: 'iFood - jantar', 'Uber para reunião'" },
        data: { type: "string", format: "date", description: "Data da despesa no formato YYYY-MM-DD. Omitir para usar a data de hoje." },
        conta_id: { type: "string", format: "uuid", description: "Conta à qual a despesa pertence. Omitir para usar a conta padrão do usuário." },
        confianca: {
          type: "string",
          enum: ["alta", "media", "baixa"],
          description: "Confiança da extração, só para auditoria — não bloqueia o registro. Use 'baixa' se decidiu registrar mesmo com alguma incerteza residual, em vez de perguntar.",
        },
      },
      required: ["valor", "categoria", "descricao"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_receita",
    description:
      "Registra uma receita (dinheiro que entrou) informada pelo usuário em linguagem natural. Só chame esta tool depois de já ter decidido, com confiança, o valor — se estiver ambíguo, pergunte antes. Exemplos: 'recebi 3000 de salário', 'me pagaram 800 de um freela', 'vendi um móvel por 150'.",
    input_schema: {
      type: "object",
      properties: {
        valor: { type: "number", exclusiveMinimum: 0, description: "Valor da receita em reais (BRL)" },
        fonte: { type: "string", description: "Origem da receita, ex.: 'salário', 'freelance - projeto X', 'venda de item usado'" },
        descricao: { type: "string", description: "Descrição adicional opcional" },
        data: { type: "string", format: "date", description: "Data da receita no formato YYYY-MM-DD. Omitir para usar a data de hoje." },
        conta_id: { type: "string", format: "uuid", description: "Conta à qual a receita pertence. Omitir para usar a conta padrão do usuário." },
        confianca: {
          type: "string",
          enum: ["alta", "media", "baixa"],
          description: "Confiança da extração, só para auditoria — não bloqueia o registro.",
        },
      },
      required: ["valor", "fonte"],
      additionalProperties: false,
    },
  },
  {
    name: "editar_transacao",
    description:
      "Corrige um ou mais campos de uma transação (despesa ou receita) já registrada, geralmente porque o usuário apontou um erro na extração original ('na verdade foi 52 reais', 'isso era transporte, não lazer'). Use o transacao_id retornado pelo registro original ou encontrado via consultar_transacoes. Informe apenas os campos que devem mudar.",
    input_schema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", format: "uuid", description: "ID da transação a corrigir" },
        valor: { type: "number", exclusiveMinimum: 0 },
        categoria: { type: "string" },
        descricao: { type: "string" },
        data: { type: "string", format: "date" },
      },
      required: ["transacao_id"],
      additionalProperties: false,
      minProperties: 2,
    },
  },
  {
    name: "excluir_transacao",
    description:
      "Remove uma transação (despesa ou receita) registrada por engano ou duplicada. Confirme com o usuário antes de chamar esta tool se houver qualquer ambiguidade sobre qual transação ele quer remover — a exclusão não pode ser desfeita pelo agente.",
    input_schema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", format: "uuid" },
        motivo: { type: "string", description: "Motivo da exclusão, para auditoria (ex.: 'duplicada', 'registrada por engano')" },
      },
      required: ["transacao_id"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_transacoes",
    description:
      "Lista transações (despesas e/ou receitas) filtradas por período e, opcionalmente, categoria ou conta. Use para responder perguntas que precisam do detalhe das transações individuais, não só do total (ex.: 'quais foram meus gastos com mercado em julho?'). Para só o total/agregado, prefira resumo_periodo — mais barato e direto.",
    input_schema: {
      type: "object",
      properties: {
        data_inicio: { type: "string", format: "date" },
        data_fim: { type: "string", format: "date" },
        tipo: { type: "string", enum: ["despesa", "receita", "todos"], description: "Filtrar por tipo de transação. Default: todos." },
        categoria: { type: "string" },
        conta_id: { type: "string", format: "uuid" },
        limite: { type: "integer", minimum: 1, maximum: 200, description: "Máximo de transações a retornar. Default: 50." },
      },
      required: ["data_inicio", "data_fim"],
      additionalProperties: false,
    },
  },
  {
    name: "resumo_periodo",
    description:
      "Retorna totais agregados (não a lista de transações individuais) de um período — total gasto, total recebido, saldo do período, e opcionalmente quebra por categoria. Use para perguntas do tipo 'quanto gastei em julho', 'como foi meu mês', 'gastei mais ou menos que o mês passado'. Mais barato que consultar_transacoes quando o usuário só quer o número final.",
    input_schema: {
      type: "object",
      properties: {
        data_inicio: { type: "string", format: "date" },
        data_fim: { type: "string", format: "date" },
        agrupar_por: { type: "string", enum: ["categoria", "conta", "nenhum"], description: "Como quebrar o resumo. Default: categoria." },
        comparar_periodo_anterior: {
          type: "boolean",
          description: "Se true, inclui a comparação com o período imediatamente anterior de mesma duração (ex.: mês passado). Default: true.",
        },
      },
      required: ["data_inicio", "data_fim"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_saldo",
    description:
      "Retorna o saldo acumulado (total de receitas menos total de despesas registradas) desde o início do uso do assistente ou de uma data específica. Atenção: este é o saldo baseado no que foi registrado manualmente no assistente, não necessariamente o saldo real da conta bancária do usuário — se a diferença for relevante para a resposta, mencione essa limitação.",
    input_schema: {
      type: "object",
      properties: {
        data_inicio: { type: "string", format: "date", description: "Data a partir da qual calcular. Omitir para considerar todo o histórico." },
        conta_id: { type: "string", format: "uuid" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "criar_orcamento",
    description:
      "Cria ou atualiza um orçamento mensal para uma categoria — um limite de gasto que o usuário quer respeitar. Se já existir um orçamento para a mesma categoria, este chamado o substitui (não cria duplicado). Use quando o usuário expressar intenção de limitar gastos numa categoria, ex.: 'quero gastar no máximo 400 com delivery por mês'.",
    input_schema: {
      type: "object",
      properties: {
        categoria: { type: "string" },
        valor_limite: { type: "number", exclusiveMinimum: 0 },
        periodo: { type: "string", enum: ["mensal"], description: "Periodicidade do orçamento. Só 'mensal' é suportado por enquanto." },
      },
      required: ["categoria", "valor_limite"],
      additionalProperties: false,
    },
  },
  {
    name: "criar_meta",
    description:
      "Cria uma meta de poupança/objetivo financeiro com valor alvo e, opcionalmente, prazo. Use quando o usuário expressar uma intenção de guardar dinheiro para algo específico, ex.: 'quero juntar 5000 para uma viagem até dezembro'.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome curto da meta, ex.: 'Viagem de fim de ano', 'Reserva de emergência'" },
        valor_alvo: { type: "number", exclusiveMinimum: 0 },
        prazo: { type: "string", format: "date", description: "Data alvo para atingir a meta. Omitir se o usuário não tiver dado um prazo." },
        valor_inicial: { type: "number", minimum: 0, description: "Valor já guardado para essa meta, se houver. Default: 0." },
      },
      required: ["nome", "valor_alvo"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_meta",
    description:
      "Registra um aporte (valor adicionado) a uma meta existente, e/ou muda seu status. Use quando o usuário disser que guardou dinheiro para uma meta específica ('separei 200 reais pra viagem') ou quando uma meta for concluída/cancelada.",
    input_schema: {
      type: "object",
      properties: {
        meta_id: { type: "string", format: "uuid" },
        valor_aportado: { type: "number", description: "Valor a somar ao progresso atual da meta. Omitir se a chamada for só para mudar status." },
        status: { type: "string", enum: ["ativa", "concluida", "cancelada"] },
      },
      required: ["meta_id"],
      additionalProperties: false,
      minProperties: 2,
    },
  },
  {
    name: "definir_regra_categorizacao",
    description:
      "Salva uma regra para categorizar automaticamente transações futuras com um padrão específico na descrição. Use quando o usuário corrigir uma categorização e a correção parecer uma regra geral (não uma exceção pontual), ex.: usuário diz 'Uber é sempre transporte pra mim, não lazer' → salvar regra padrao='uber', categoria='transporte'. Também pode ser chamada proativamente quando o agente perceber um padrão repetido nas últimas transações.",
    input_schema: {
      type: "object",
      properties: {
        padrao_texto: { type: "string", description: "Trecho de texto que, quando aparecer numa descrição futura, deve disparar a categoria indicada. Ex.: 'uber', 'ifood', 'netflix'" },
        categoria: { type: "string" },
      },
      required: ["padrao_texto", "categoria"],
      additionalProperties: false,
    },
  },
];

/**
 * Tools da camada de memoria RAG (docs/RAG_MEMORY_ARCHITECTURE.md, secao 4) -
 * so entram em `toolDefinitions` quando `ragEnabled` for true.
 */
const ragToolDefinitions: ToolDefinition[] = [
  {
    name: "atualizar_perfil",
    description:
      "Atualiza um fato estável de vida pessoal do usuário no perfil (ex.: ocupação, estabilidade de renda, situação familiar, grandes objetivos, estilo de vida). Use quando o usuário afirmar algo claramente permanente sobre si mesmo (ex.: 'sou autônomo', 'tenho dois filhos'), ou quando o mesmo fato narrativo for confirmado mais de uma vez. Para algo ainda incerto ou em andamento, prefira registrar_contexto_pessoal ou registrar_decisao.",
    input_schema: {
      type: "object",
      properties: {
        atributo: {
          type: "string",
          description: "Nome curto do atributo, ex.: 'ocupacao', 'estabilidade_renda', 'situacao_familiar', 'grandes_objetivos', 'estilo_de_vida'",
        },
        valor: { type: "string", description: "Valor do atributo em texto, ex.: 'autonomo - designer', 'casado, 2 filhos'" },
      },
      required: ["atributo", "valor"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_contexto_pessoal",
    description:
      "Registra um fato narrativo sobre a vida pessoal do usuário que ainda não é estável o suficiente para virar um atributo permanente do perfil (ver atualizar_perfil), mas que é relevante para aconselhar com contexto (ex.: 'está pensando em pedir demissão', 'prioriza viajar com a família sobre comprar carro novo'). A categoria é obrigatória e restrita às 6 categorias permitidas abaixo. NUNCA registre saúde física/mental, orientação sexual, religião, opinião política, raça/etnia, dado biométrico, ou detalhes pessoais sobre terceiros que não afetem o orçamento do próprio usuário - na dúvida, não chame esta tool. Se o usuário pedir para esquecer algo já registrado, use esquecer_contexto_pessoal.",
    input_schema: {
      type: "object",
      properties: {
        fato: { type: "string", description: "O fato narrativo em si, de forma objetiva e curta" },
        categoria: {
          type: "string",
          enum: [
            "familia_dependentes",
            "trabalho_renda",
            "objetivos_planos",
            "valores_estilo_vida",
            "eventos_vida",
            "relacao_com_dinheiro",
          ],
        },
      },
      required: ["fato", "categoria"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_decisao",
    description:
      "Registra uma decisão ou intenção financeira que o usuário verbalizou (ex.: 'vou tentar cortar Uber esse mês', 'decidi pausar a assinatura da academia'), para lembrar disso em conversas futuras e poder comentar o progresso depois. Não é para preferências permanentes (ver atualizar_perfil) nem para transações (ver registrar_gasto/registrar_receita).",
    input_schema: {
      type: "object",
      properties: {
        fato: { type: "string", description: "A decisão ou intenção verbalizada, de forma objetiva" },
        periodo_referencia: {
          type: "string",
          format: "date",
          description: "Mês/período de referência da decisão (primeiro dia do mês, YYYY-MM-DD). Omitir se não houver período específico.",
        },
      },
      required: ["fato"],
      additionalProperties: false,
    },
  },
  {
    name: "buscar_insights_usuario",
    description:
      "Busca por similaridade insights e contexto pessoal já registrados sobre o usuário (anomalias, padrões recorrentes, decisões passadas, contexto pessoal narrativo). Use para perguntas qualitativas como 'tenho gastado mais que o normal?', e sempre antes de dar um conselho ou sugestão proativa, para considerar contexto pessoal relevante já conhecido. Para números exatos, prefira consultar_transacoes/resumo_periodo.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Descrição em linguagem natural do que buscar" },
        periodo: { type: "string", format: "date", description: "Filtra insights com período de referência a partir desta data. Omitir para buscar em todo o histórico." },
        tipo: {
          type: "string",
          enum: ["resumo_mensal", "anomalia", "padrao_recorrente", "decisao_usuario", "contexto_pessoal"],
          description: "Filtrar por tipo de insight. Omitir para buscar em todos os tipos.",
        },
        limite: { type: "integer", minimum: 1, maximum: 20, description: "Default: 5" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "buscar_principios_financeiros",
    description:
      "Busca princípios e frameworks financeiros curados (orçamento, reserva de emergência, quitação de dívida, priorização de metas, armadilhas comportamentais) para fundamentar um conselho. Sempre combine com os números reais do usuário (consultar_transacoes/resumo_periodo) e, quando relevante, com buscar_insights_usuario(tipo=contexto_pessoal) antes de responder a um pedido de conselho ou sugestão.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Descrição em linguagem natural do princípio ou situação buscada" },
        limite: { type: "integer", minimum: 1, maximum: 10, description: "Default: 5" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "esquecer_contexto_pessoal",
    description:
      "Apaga permanentemente um insight ou contexto pessoal já registrado sobre o usuário. Use sempre que o usuário pedir para esquecer/apagar algo mencionado antes - esse pedido deve ser atendido de imediato, sem perguntar o motivo. Use o id retornado por buscar_insights_usuario para identificar qual registro apagar; se não tiver certeza de qual é, busque primeiro com buscar_insights_usuario.",
    input_schema: {
      type: "object",
      properties: {
        memoria_id: { type: "string", format: "uuid" },
      },
      required: ["memoria_id"],
      additionalProperties: false,
    },
  },
];

export const toolDefinitions: ToolDefinition[] = [...baseToolDefinitions, ...ragToolDefinitions];

export interface ResultadoTool {
  conteudo: string;
  ehErro: boolean;
}

/**
 * Despacha uma tool_use para a funcao de banco correspondente. Erros de
 * validacao/ownership (lancados pelos modulos de src/db/*) sao capturados e
 * devolvidos como tool_result com is_error, para o agente poder reagir (ex.:
 * tentar de novo com "outros", ou avisar o usuario) em vez de derrubar a
 * conversa inteira.
 */
export async function executeTool(name: string, input: unknown, usuarioId: string): Promise<ResultadoTool> {
  try {
    const resultado = await despachar(name, input, usuarioId);
    return { conteudo: JSON.stringify(resultado), ehErro: false };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    logger.warn({ usuarioId, tool: name, input, erro: mensagem }, "falha ao executar tool");
    return { conteudo: mensagem, ehErro: true };
  }
}

async function despachar(name: string, input: any, usuarioId: string): Promise<unknown> {
  switch (name) {
    case "registrar_gasto":
      return registrarDespesa(usuarioId, input);
    case "registrar_receita":
      return registrarReceita(usuarioId, input);
    case "editar_transacao":
      return editarTransacao(usuarioId, input);
    case "excluir_transacao":
      return excluirTransacao(usuarioId, input.transacao_id, input.motivo);
    case "consultar_transacoes":
      return consultarTransacoes(usuarioId, input);
    case "resumo_periodo":
      return resumoPeriodo(usuarioId, input);
    case "consultar_saldo":
      return consultarSaldo(usuarioId, input);
    case "criar_orcamento":
      return criarOuAtualizarOrcamento(usuarioId, input.categoria, input.valor_limite);
    case "criar_meta":
      return criarMeta(usuarioId, input);
    case "atualizar_meta":
      return atualizarMeta(usuarioId, input);
    case "definir_regra_categorizacao":
      return definirRegraCategorizacao(usuarioId, input.padrao_texto, input.categoria);
    case "atualizar_perfil":
      return atualizarAtributoPerfil(usuarioId, input.atributo, input.valor);
    case "registrar_contexto_pessoal":
      return registrarInsight(usuarioId, {
        tipo: "contexto_pessoal",
        conteudo: input.fato,
        categoria: input.categoria,
        origem: "conversa",
      });
    case "registrar_decisao":
      return registrarInsight(usuarioId, {
        tipo: "decisao_usuario",
        conteudo: input.fato,
        periodoReferencia: input.periodo_referencia,
        origem: "conversa",
      });
    case "buscar_insights_usuario":
      return buscarInsights(usuarioId, input.query, {
        tipo: input.tipo,
        periodoDesde: input.periodo,
        limite: input.limite,
      });
    case "buscar_principios_financeiros":
      return buscarPrincipios(input.query, input.limite);
    case "esquecer_contexto_pessoal":
      return excluirInsight(usuarioId, input.memoria_id);
    default:
      throw new Error(`tool desconhecida: ${name}`);
  }
}
