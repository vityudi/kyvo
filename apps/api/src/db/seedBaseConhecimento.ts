import { inserirDocumento, tituloExiste } from "./baseConhecimento.js";
import { pool } from "./pool.js";

/**
 * Corpus curado manualmente (RAG_MEMORY_ARCHITECTURE.md, secao 3.5) - nao e
 * gerado por IA nem pelo comportamento do usuario. Serve para fundamentar o
 * conselho do agente em vez de deixa-lo responder so do conhecimento
 * parametrico do modelo.
 */
const CORPUS: { titulo: string; conteudo: string; tags: string[] }[] = [
  {
    titulo: "Regra 50/30/20",
    conteudo:
      "A regra 50/30/20 divide a renda liquida em tres blocos: 50% para necessidades essenciais (moradia, contas, mercado, transporte), 30% para desejos/estilo de vida (lazer, assinaturas, delivery) e 20% para poupanca e quitacao de dividas acima do minimo. E um ponto de partida simples, nao uma regra rigida - quem mora em cidade cara ou tem renda baixa pode precisar de mais de 50% em necessidades, e isso nao e fracasso, e realidade.",
    tags: ["orcamento", "regra-geral"],
  },
  {
    titulo: "Orcamento base zero",
    conteudo:
      "No orcamento base zero, toda a renda do mes e alocada a uma categoria especifica antes de o mes comecar, ate sobrar zero nao-alocado (renda menos despesas menos poupanca = zero). Diferente de so registrar gastos depois que acontecem, aqui cada real tem um destino decidido com antecedencia. Funciona bem para quem tem renda variavel ou quer sair do modo reativo de so descobrir o rombo no fim do mes.",
    tags: ["orcamento", "planejamento"],
  },
  {
    titulo: "Sistema de envelopes",
    conteudo:
      "O sistema de envelopes aloca um valor fixo por categoria de gasto discricionario (ex.: lazer, delivery) no inicio do mes - fisicamente em dinheiro ou, na versao digital, em contas/carteiras separadas. Quando o envelope de uma categoria esvazia, os gastos naquela categoria param ate o proximo ciclo. E especialmente util para categorias onde o gasto por impulso costuma escapar do controle.",
    tags: ["orcamento", "controle-de-gastos"],
  },
  {
    titulo: "Reserva de emergencia - quanto guardar",
    conteudo:
      "A recomendacao classica e de 3 a 6 meses de despesas essenciais guardados em local liquido e seguro. Renda estavel (CLT, funcionario publico) tende para o piso da faixa (3 meses); renda variavel ou instavel (autonomo, comissionado, freelancer) deve mirar o teto ou ate mais (6 a 12 meses), porque o intervalo entre perder renda e recompor um fluxo estavel costuma ser maior e mais imprevisivel.",
    tags: ["reserva-emergencia", "planejamento"],
  },
  {
    titulo: "Reserva de emergencia - onde guardar",
    conteudo:
      "A reserva de emergencia deve ficar em algo com liquidez diaria e risco praticamente nulo - tipicamente CDB com liquidez diaria de banco solido, fundo DI de taxa baixa, ou Tesouro Selic. Nao e o lugar para buscar rentabilidade maior: o objetivo unico dessa reserva e estar disponivel no momento exato de uma emergencia, mesmo que isso signifique abrir mao de retorno.",
    tags: ["reserva-emergencia", "investimento"],
  },
  {
    titulo: "Prioridade da reserva de emergencia sobre outras metas",
    conteudo:
      "Antes de acelerar outras metas (viagem, entrada de imovel, investimentos de risco), a reserva de emergencia minima deve vir primeiro - sem ela, qualquer imprevisto (perda de renda, gasto medico, conserto urgente) forca o uso de credito caro ou a quebra de uma meta de longo prazo em andamento. Uma excecao comum e dividas com juros muito altos (rotativo de cartao, cheque especial), que competem diretamente com a prioridade da reserva.",
    tags: ["reserva-emergencia", "priorizacao"],
  },
  {
    titulo: "Estrategia bola de neve (snowball) para quitar dividas",
    conteudo:
      "Na bola de neve, as dividas sao ordenadas da menor para a maior pelo saldo devedor, e o valor extra disponivel vai para quitar a menor primeiro, mantendo o minimo nas demais. Ao quitar uma divida, o valor que ia para ela e somado ao ataque da proxima. O ganho principal e psicologico: vitorias rapidas e visiveis mantem a motivacao, o que importa quando o risco real e desistir do plano no meio do caminho.",
    tags: ["divida", "priorizacao"],
  },
  {
    titulo: "Estrategia avalanche para quitar dividas",
    conteudo:
      "Na avalanche, as dividas sao ordenadas da maior taxa de juros para a menor, e o valor extra ataca primeiro a divida mais cara, independente do saldo. Matematicamente e sempre a estrategia que minimiza o total de juros pagos ao longo do tempo. Faz mais sentido para quem ja tem disciplina financeira estabelecida e nao depende tanto do reforco psicologico de vitorias rapidas.",
    tags: ["divida", "priorizacao"],
  },
  {
    titulo: "Bola de neve vs. avalanche - como escolher",
    conteudo:
      "Nao existe resposta unica certa: avalanche economiza mais dinheiro em juros, bola de neve tem taxa de adesao mais alta em estudos comportamentais porque sustenta a motivacao. Para quem ja tentou quitar dividas antes e desistiu no meio, bola de neve tende a funcionar melhor na pratica. Para quem tem disciplina comprovada e a diferenca de juros entre as dividas e grande, avalanche economiza mais.",
    tags: ["divida", "priorizacao", "comportamento"],
  },
  {
    titulo: "Divida com juros altos compete com investimento",
    conteudo:
      "Quitar uma divida com juros de 10% ao mes (tipico de rotativo de cartao no Brasil) e matematicamente equivalente a um investimento garantido de 10% ao mes livre de risco - nenhuma aplicacao legitima paga isso. Por isso, exceto pela reserva de emergencia minima ja constituida, quitar divida cara quase sempre deve vir antes de comecar a investir o excedente.",
    tags: ["divida", "investimento"],
  },
  {
    titulo: "Priorizacao de metas concorrentes - curto vs. longo prazo",
    conteudo:
      "Quando existem multiplas metas ativas ao mesmo tempo (viagem em 6 meses, entrada de imovel em 3 anos, aposentadoria), a ordem pratica costuma ser: 1) reserva de emergencia minima, 2) dividas de juros altos, 3) metas de curto prazo com data fixa proxima (menos tempo para o mercado suavizar oscilacoes, entao guardar em renda fixa/liquida), 4) metas de longo prazo (mais tolerancia a algum risco/volatilidade). Metas de curto prazo nao devem competir por espaco com metas de longo prazo que ainda tem anos para crescer.",
    tags: ["metas", "priorizacao"],
  },
  {
    titulo: "Lifestyle inflation (inflacao de estilo de vida)",
    conteudo:
      "Lifestyle inflation e o padrao de aumentar o padrao de gastos automaticamente a cada aumento de renda, sem aumentar proporcionalmente a poupanca - o resultado e que ganhar mais nao muda a saude financeira no longo prazo. O contraponto pratico e definir, antes do aumento chegar, que porcentagem dele vai direto para poupanca/investimento (ex.: metade de todo aumento futuro), antes que o padrao de vida absorva o valor inteiro.",
    tags: ["comportamento", "armadilha"],
  },
  {
    titulo: "Gasto por impulso e o atraso deliberado",
    conteudo:
      "Uma tecnica simples contra gasto por impulso e a regra do atraso deliberado: para compras acima de um valor definido pela propria pessoa (ex.: R$150) que nao sejam essenciais, esperar 24 a 72 horas antes de decidir. A maioria dos impulsos perde a forca depois desse intervalo; se o desejo continuar depois do prazo, e mais provavel que seja uma decisao real e nao so um gatilho emocional do momento.",
    tags: ["comportamento", "armadilha"],
  },
  {
    titulo: "Ilusao do dinheiro de plastico",
    conteudo:
      "Pagar no cartao (credito ou debito) reduz a dor psicologica da perda comparado a pagar em dinheiro fisico, o que tende a aumentar o gasto total sem a pessoa perceber - e um efeito bem documentado em pesquisa comportamental. Um contra-habito pratico e revisar a fatura do cartao semanalmente (nao so no vencimento) para reconectar o gasto a sua consequencia no tempo em que ele acontece, nao um mes depois.",
    tags: ["comportamento", "armadilha"],
  },
  {
    titulo: "Contabilidade mental (mental accounting)",
    conteudo:
      "Contabilidade mental e a tendencia de tratar o mesmo valor de forma diferente dependendo de onde ele 'veio' (ex.: gastar um bonus ou 13o com mais leveza do que o salario normal, mesmo sendo o mesmo dinheiro fungivel). Isso leva a decisoes inconsistentes: alguem pode se recusar a usar reserva de emergencia para uma urgencia real, mas gastar um bonus inteiro em impulso. Reconhecer que todo real vale o mesmo, independente da origem, ajuda a decidir com mais consistencia.",
    tags: ["comportamento", "armadilha"],
  },
  {
    titulo: "Ancoragem em precos e percepcao de desconto",
    conteudo:
      "Ancoragem e o vies de julgar um preco como bom ou ruim com base no primeiro numero visto (ex.: um preco 'de' riscado alto ao lado do preco 'por' menor), mesmo sem saber se o preco original era real ou justo. Promocoes e liquidacoes exploram esse vies deliberadamente. Um contraponto pratico e avaliar se a compra faria sentido pelo preco atual mesmo sem o contraste do desconto - se a resposta for nao, o desconto nao e motivo suficiente.",
    tags: ["comportamento", "armadilha"],
  },
];

async function seed(): Promise<void> {
  let inseridos = 0;
  let pulados = 0;

  for (const doc of CORPUS) {
    if (await tituloExiste(doc.titulo)) {
      pulados++;
      continue;
    }
    await inserirDocumento(doc.titulo, doc.conteudo, doc.tags);
    inseridos++;
    console.log(`[seed:conhecimento] inserido: ${doc.titulo}`);
  }

  console.log(`[seed:conhecimento] concluido - ${inseridos} inseridos, ${pulados} ja existiam`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
