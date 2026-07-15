-- Dedupe de alertas proativos (FOUNDATION.md, decisao #2) - garante que o
-- mesmo alerta (mesmo usuario/tipo/chave/periodo) nao seja reenviado a cada
-- vez que o worker roda enquanto a condicao continuar verdadeira.

create table alerta_enviado (
    id                  uuid primary key default gen_random_uuid(),
    usuario_id          uuid not null references usuario(id) on delete cascade,
    tipo                text not null check (tipo in ('orcamento_estourado', 'meta_prazo_proximo')),

    -- categoria (orcamento_estourado) ou meta_id (meta_prazo_proximo)
    chave               text not null,

    -- mes corrente (orcamento_estourado, reseta todo mes) ou o proprio prazo
    -- da meta (meta_prazo_proximo, so realerta se o prazo mudar)
    periodo_referencia  date not null,

    criado_em           timestamptz not null default now(),

    unique (usuario_id, tipo, chave, periodo_referencia)
);

create index idx_alerta_enviado_usuario on alerta_enviado (usuario_id);
