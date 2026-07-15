-- Schema inicial do Kyvo.
-- Consolida as decisoes registradas em docs/FOUNDATION.md,
-- docs/RAG_MEMORY_ARCHITECTURE.md e docs/TOOLS_FASE_0_1.md.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Usuario e contas
-- ---------------------------------------------------------------------------

create table usuario (
    id               uuid primary key default gen_random_uuid(),
    telegram_chat_id bigint unique not null,
    criado_em        timestamptz not null default now()
);

-- 'manual'  = conta criada pelo proprio usuario/assistente, sem integracao bancaria
-- 'pluggy'  = conta sincronizada via Open Finance (Fase 2+)
create table conta (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    nome            text not null,
    tipo            text not null default 'manual' check (tipo in ('manual', 'pluggy')),
    pluggy_item_id  text,
    criado_em       timestamptz not null default now()
);

create index idx_conta_usuario on conta (usuario_id);

-- ---------------------------------------------------------------------------
-- Categorias
-- usuario_id nulo = categoria padrao, disponivel para todos os usuarios.
-- ---------------------------------------------------------------------------

create table categoria (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid references usuario(id) on delete cascade,
    nome        text not null,
    tipo        text not null default 'ambos' check (tipo in ('despesa', 'receita', 'ambos')),
    criado_em   timestamptz not null default now()
);

create index idx_categoria_usuario on categoria (usuario_id);

insert into categoria (usuario_id, nome, tipo) values
    (null, 'alimentacao', 'despesa'),
    (null, 'mercado', 'despesa'),
    (null, 'transporte', 'despesa'),
    (null, 'moradia', 'despesa'),
    (null, 'lazer', 'despesa'),
    (null, 'saude', 'despesa'),
    (null, 'educacao', 'despesa'),
    (null, 'assinaturas', 'despesa'),
    (null, 'compras', 'despesa'),
    (null, 'outros', 'ambos'),
    (null, 'salario', 'receita'),
    (null, 'freelance', 'receita'),
    (null, 'investimentos', 'receita');

-- ---------------------------------------------------------------------------
-- Transacoes (fonte de verdade - camada 3 de RAG_MEMORY_ARCHITECTURE.md)
-- categoria fica denormalizada como texto: as tools validam contra a tabela
-- `categoria` em tempo de execucao (ver TOOLS_FASE_0_1.md, secao 1).
-- ---------------------------------------------------------------------------

create table transacao (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    conta_id        uuid not null references conta(id) on delete cascade,

    tipo            text not null check (tipo in ('despesa', 'receita')),
    valor           numeric(12, 2) not null check (valor > 0),
    categoria       text not null,
    descricao       text,
    fonte           text, -- so usado quando tipo = 'receita' (ex.: 'salario', 'freela X')
    data            date not null default current_date,

    -- confianca da extracao, so para auditoria (ver TOOLS_FASE_0_1.md, secao 1,
    -- principio 3) - nao bloqueia o registro.
    confianca       text check (confianca in ('alta', 'media', 'baixa')),

    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_transacao_usuario_data on transacao (usuario_id, data desc);
create index idx_transacao_usuario_categoria on transacao (usuario_id, categoria);
create index idx_transacao_conta on transacao (conta_id);

-- ---------------------------------------------------------------------------
-- Orcamentos e metas (core memory - camada 2)
-- ---------------------------------------------------------------------------

create table orcamento (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    categoria       text not null,
    valor_limite    numeric(12, 2) not null check (valor_limite > 0),
    periodo         text not null default 'mensal' check (periodo in ('mensal')),
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now(),

    unique (usuario_id, categoria)
);

create table meta (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    nome            text not null,
    valor_alvo      numeric(12, 2) not null check (valor_alvo > 0),
    valor_atual     numeric(12, 2) not null default 0 check (valor_atual >= 0),
    prazo           date,
    status          text not null default 'ativa' check (status in ('ativa', 'concluida', 'cancelada')),
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_meta_usuario on meta (usuario_id, status);

create table regra_categorizacao (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    padrao_texto    text not null,
    categoria       text not null,
    criado_em       timestamptz not null default now(),

    unique (usuario_id, padrao_texto)
);

-- Preferencias de interacao (tom de resposta, idioma, etc.) - distinto de
-- perfil_usuario (fatos de vida pessoal, ver abaixo).
create table preferencia_usuario (
    usuario_id      uuid primary key references usuario(id) on delete cascade,
    atributos       jsonb not null default '{}'::jsonb,
    atualizado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Perfil pessoal (RAG_MEMORY_ARCHITECTURE.md, secao 3.2b / 7.3)
-- Fatos estaveis de vida pessoal usados para o assistente agir como
-- conselheiro. Singleton por usuario, sem embedding - sempre injetado
-- por inteiro no system prompt.
-- ---------------------------------------------------------------------------

create table perfil_usuario (
    usuario_id      uuid primary key references usuario(id) on delete cascade,
    atributos       jsonb not null default '{}'::jsonb,
    atualizado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Memoria episodica / insights (RAG_MEMORY_ARCHITECTURE.md, secao 3.4/3.6/7.1)
-- Cobre insights financeiros (resumo_mensal, anomalia, padrao_recorrente,
-- decisao_usuario) e contexto pessoal narrativo (contexto_pessoal).
--
-- Busca por full-text search nativo do Postgres (tsvector/ts_rank), nao por
-- similaridade vetorial - decisao de nao depender de nenhum modelo de
-- embedding/servico de IA alem do Claude (ver docs/RAG_MEMORY_ARCHITECTURE.md,
-- secao 6).
-- ---------------------------------------------------------------------------

create table memoria_insight (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,

    tipo            text not null check (
                        tipo in (
                            'resumo_mensal', 'anomalia', 'padrao_recorrente', 'decisao_usuario',
                            'contexto_pessoal'
                        )
                    ),

    -- obrigatorio apenas quando tipo = 'contexto_pessoal' (guardrail de
    -- privacidade, ver docs/RAG_MEMORY_ARCHITECTURE.md secao 3.7).
    categoria       text check (
                        categoria is null or categoria in (
                            'familia_dependentes', 'trabalho_renda', 'objetivos_planos',
                            'valores_estilo_vida', 'eventos_vida', 'relacao_com_dinheiro'
                        )
                    ),
    constraint chk_categoria_exigida_contexto_pessoal check (
        tipo <> 'contexto_pessoal' or categoria is not null
    ),

    periodo_referencia date,
    conteudo            text not null,

    busca tsvector generated always as (to_tsvector('portuguese', conteudo)) stored,

    metadata        jsonb not null default '{}'::jsonb,
    origem          text not null default 'worker' check (origem in ('worker', 'conversa')),

    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_memoria_insight_usuario on memoria_insight (usuario_id);
create index idx_memoria_insight_usuario_tipo on memoria_insight (usuario_id, tipo);
create index idx_memoria_insight_periodo on memoria_insight (usuario_id, periodo_referencia);
create index idx_memoria_insight_busca on memoria_insight using gin (busca);

-- ---------------------------------------------------------------------------
-- Base de conhecimento curada (RAG_MEMORY_ARCHITECTURE.md, secao 3.5/7.2)
-- Corpus global, populado manualmente - nao ha usuario_id.
-- ---------------------------------------------------------------------------

create table base_conhecimento (
    id              uuid primary key default gen_random_uuid(),

    titulo          text not null,
    conteudo        text not null,

    busca tsvector generated always as (to_tsvector('portuguese', titulo || ' ' || conteudo)) stored,

    tags            text[] not null default '{}',
    ativo           boolean not null default true,

    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_base_conhecimento_tags on base_conhecimento using gin (tags);
create index idx_base_conhecimento_ativo on base_conhecimento (ativo);
create index idx_base_conhecimento_busca on base_conhecimento using gin (busca);
