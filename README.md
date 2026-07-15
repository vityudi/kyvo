# Kyvo

Assistente financeiro pessoal com IA e memória. Você conversa em linguagem natural pelo Telegram — "gastei 47 reais no ifood", "quanto eu gastei com mercado esse mês?", "separa 500 reais pra viagem em dezembro" — e o Kyvo registra, responde e ajuda a planejar suas finanças, aprendendo suas preferências e o contexto da sua vida ao longo do tempo para dar sugestões que realmente fazem sentido pra você.

> Status: Fase 0, Fase 1 e a camada de memória pessoal/RAG (perfil, contexto, insights, conhecimento curado) já implementadas e rodando via tool use com o Claude. Alertas proativos (worker) e integração com Open Finance (Pluggy) ainda não — ver [Roadmap](#roadmap).

---

## O que o Kyvo faz (visão do produto)

- **Entende** o que você digita em linguagem natural — registro de gasto, pergunta sobre o mês, intenção de guardar dinheiro pra algo.
- **Guarda** o dado de forma confiável: toda transação vira uma linha determinística no banco, nunca uma "lembrança aproximada" da IA.
- **Lembra** de você entre conversas — preferências, metas ativas, e contexto de vida (família, ocupação, objetivos) que molda o tipo de sugestão que faz sentido.
- **Planeja** com você — orçamentos por categoria, metas de poupança, alertas quando algo sai do previsto.

A IA nunca escreve direto no banco a partir de texto livre: toda ação passa por *tool calls* estruturadas e validadas, executadas por código determinístico. Isso evita o maior risco de um assistente financeiro — a IA "inventar" um valor ou categoria.

---

## Arquitetura em uma imagem

```
Usuário ⇄ Telegram (webhook) ⇄ app (Fastify)  ──tool use──▶ Claude API
                                    │
                                    ▼
                              Postgres (full-text search nativo)
                                    ▲
                                    │
                              worker (cron) ── alertas proativos,
                                                consolidação de memória
```

- **`app`** — recebe o webhook do Telegram, monta o contexto (preferências, metas, perfil, histórico recente), chama o Claude com tool use, executa as tools contra o Postgres e responde ao usuário.
- **`worker`** — processo separado, roda independente de mensagens: verifica orçamentos/metas para disparar alertas proativos, e (nas fases seguintes) consolida memória semântica periodicamente.
- **`postgres`** — fonte de verdade de tudo: transações, contas, orçamentos, metas, preferências, perfil pessoal e a camada de memória (insights + base de conhecimento curada, buscados por full-text search nativo) usada para dar respostas mais assertivas em planejamento. Único serviço de IA usado no projeto é o Claude — sem modelo de embedding nem vendor adicional.

O design completo — por que essas decisões, o roteamento entre SQL determinístico e busca semântica, os guardrails de privacidade da memória pessoal — está documentado no material de planejamento do projeto (fora deste repositório de código).

---

## Stack

| Camada | Escolha |
|---|---|
| Linguagem/runtime | TypeScript + Node.js 20 |
| Servidor HTTP | Fastify |
| Banco de dados | PostgreSQL (full-text search nativo para a camada de memória/RAG) |
| IA | [Claude API](https://www.anthropic.com/api) (Anthropic), via tool use — único serviço de IA do projeto |
| Canal de chat | Telegram Bot API |
| Integração bancária | [Pluggy](https://pluggy.ai/) (Open Finance Brasil) — a partir da Fase 2 |
| Empacotamento | Docker + Docker Compose |

---

## Rodando localmente com Docker Compose

Pré-requisitos: [Docker](https://docs.docker.com/get-docker/) e Docker Compose (já incluso no Docker Desktop).

### 1. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` e preencha pelo menos:

| Variável | Onde conseguir |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `TELEGRAM_BOT_TOKEN` | Fale com [@BotFather](https://t.me/BotFather) no Telegram e crie um bot |
| `POSTGRES_PASSWORD` | Defina uma senha forte própria — não use o valor de exemplo |

As demais variáveis (`PLUGGY_*`) só são necessárias a partir das fases posteriores do roadmap — pode deixar em branco por enquanto. Veja a lista completa comentada em [`.env.example`](./.env.example).

### 2. Suba a stack

```bash
docker compose up --build -d
```

Isso builda a imagem da aplicação, sobe o Postgres, aplica as migrations automaticamente (o `app` e o `worker` rodam as migrations pendentes no boot, de forma segura mesmo subindo ao mesmo tempo) e inicia os dois serviços.

Verifique que subiu:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### 3. Aponte o webhook do Telegram para o seu servidor

O Telegram precisa conseguir alcançar seu `app` via HTTPS público. Em produção isso normalmente é um domínio atrás de um reverse proxy (Caddy, Nginx, Traefik) com TLS — fora do escopo deste `docker-compose.yml`, que cobre só a stack da aplicação. Para testar localmente, uma opção é expor a porta `3000` via [ngrok](https://ngrok.com/) ou similar.

Com a URL pública em mãos:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://SEU_DOMINIO/webhook/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

`secret_token` é opcional, mas recomendado — se definido, deve ser o mesmo valor de `TELEGRAM_WEBHOOK_SECRET` no seu `.env`; o Kyvo usa isso para validar que a requisição realmente veio do Telegram.

### Comandos úteis

```bash
docker compose logs -f app       # logs do servidor
docker compose logs -f worker    # logs do worker/scheduler
docker compose down              # parar tudo (mantém os dados do Postgres)
docker compose down -v           # parar e apagar também o volume do Postgres
```

---

## Desenvolvimento sem Docker

Útil para iterar rápido no código. Ainda assim precisa de um Postgres disponível — pode ser o do próprio `docker compose up postgres`, apontando `POSTGRES_HOST=localhost` no seu `.env` local.

```bash
npm install
cp .env.example .env   # ajuste POSTGRES_HOST=localhost e as demais chaves
npm run migrate         # aplica o schema
npm run dev              # servidor com hot-reload
npm run dev:worker       # em outro terminal, o worker com hot-reload
```

Scripts disponíveis: `npm run build`, `npm run start`/`start:worker` (produção, a partir de `dist/`), `npm run typecheck`.

---

## Estrutura do projeto

```
src/
  config/env.ts             - validação centralizada de variáveis de ambiente (zod)
  db/
    pool.ts                  - pool de conexão com o Postgres
    migrate.ts               - runner de migrations (idempotente, com lock)
    migrations/                - schema versionado, em SQL puro
    usuario.ts                   - acesso a dados do usuário/conta
    categoria.ts                  - validação e listagem de categorias
    transacao.ts                    - registro/edição/consulta de despesas e receitas
    orcamento.ts, meta.ts              - orçamentos e metas
    regraCategorizacao.ts                - regras de categorização aprendidas
    mensagem.ts                            - histórico curto de conversa
    perfilUsuario.ts                         - perfil pessoal (core memory)
    memoriaInsight.ts                          - insights e contexto pessoal (full-text search)
    baseConhecimento.ts                          - base de conhecimento curada (full-text search)
    seedBaseConhecimento.ts                        - popula a base de conhecimento (npm run seed:conhecimento)
  lib/
    anthropic.ts        - cliente Claude
    agent.ts              - system prompt + loop de agente (tool use)
    tools.ts                - as tools do agente (schema + dispatcher)
    telegram.ts                - cliente mínimo da Bot API do Telegram
    logger.ts                    - logger estruturado (pino)
  routes/telegram.ts             - webhook do Telegram
  server.ts                        - processo "app" (HTTP)
  worker.ts                         - processo "worker" (cron/alertas)
```

Schema versionado em `src/db/migrations/*.sql`, aplicado automaticamente no boot de `server.ts`/`worker.ts` — não é necessário rodar uma migration manualmente em uso normal, mas `npm run migrate` está disponível para aplicar fora do boot da aplicação (ex.: num passo de deploy separado).

---

## Rodando na sua própria infraestrutura

O projeto foi desenhado para ser replicável — qualquer pessoa pode clonar este repositório e rodar sua própria instância, sem depender de nenhum serviço específico de um provedor:

- **Toda configuração é por variável de ambiente** (`.env`) — nenhuma chave, token ou segredo fica no código.
- **Um único `docker-compose.yml`** sobe a stack inteira (app + worker + banco) em qualquer host com Docker — VPS própria, Railway, Fly.io, um servidor em casa.
- **O banco é o único estado persistente** (volume `kyvo_postgres_data`) — backup e restore da instância se resumem a isso.
- **Nenhuma integração é obrigatória para rodar o núcleo do produto** — Pluggy (Open Finance) é aditiva; o Kyvo funciona com só `ANTHROPIC_API_KEY` e `TELEGRAM_BOT_TOKEN` preenchidos.

Se for expor publicamente, lembre de colocar um reverse proxy com TLS na frente do serviço `app` (o `docker-compose.yml` não inclui isso de propósito, para não amarrar o projeto a uma escolha específica de proxy/certificado) e de **não** expor a porta do Postgres publicamente (por padrão ela já não é publicada — ver comentário em `docker-compose.yml`).

---

## Roadmap

| Fase | Escopo |
|---|---|
| **Fase 0** ✅ | Esqueleto conversacional — registro de despesas e receitas via linguagem natural, com correção manual |
| **Fase 1** ✅ | Consulta/resumo de transações, orçamentos, metas, memória de preferências e regras de categorização |
| **Memória RAG** ✅ | Perfil pessoal, contexto narrativo, insights e base de conhecimento curada (full-text search) — "modo conselheiro" |
| **Fase 2** (em andamento) | Alertas proativos (worker: checagem de orçamento/meta + pipeline de anomalia/resumo mensal) e integração com Open Finance (Pluggy) |
| **Fase 3** | Segundo canal (WhatsApp), relatórios visuais |

---

## Princípios de design

- **A IA nunca é a fonte de verdade de um número.** Saldo, histórico e totais sempre vêm de uma query determinística — a IA consulta, não "lembra".
- **Confirmação proporcional à confiança.** Uma extração clara é registrada direto; algo ambíguo gera uma pergunta antes de gravar.
- **Memória pessoal tem limites explícitos.** O que o assistente pode guardar sobre a vida do usuário (família, trabalho, objetivos) é uma lista fechada — dados sensíveis (saúde, religião, orientação, política, dados de terceiros) nunca são capturados, mesmo mencionados de passagem.
- **Sem infraestrutura desnecessária.** Cada peça nova (worker, Open Finance) só entra quando o produto realmente precisa dela — nada é adicionado especulativamente. A camada de memória usa full-text search nativo do Postgres em vez de embeddings, mantendo o Claude como único serviço de IA do projeto.

---

## Licença

A definir.
