-- Historico curto de conversa (FOUNDATION.md, secao 4.3): guarda so o texto
-- final de cada turno (mensagem do usuario e resposta final do agente), nao
-- os blocos internos de tool_use/tool_result do loop do agente.

create table mensagem (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuario(id) on delete cascade,
    role        text not null check (role in ('user', 'assistant')),
    conteudo    text not null,
    criado_em   timestamptz not null default now()
);

create index idx_mensagem_usuario_criado on mensagem (usuario_id, criado_em);
