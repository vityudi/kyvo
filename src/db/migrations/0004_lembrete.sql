-- Lembretes e tarefas do usuario, na mesma tabela (tipo diferencia os dois):
--   - 'lembrete': dispara uma mensagem proativa no Telegram em data_hora (worker
--     varre a cada minuto). Pode ser pontual ou recorrente (recorrencia).
--   - 'tarefa': afazer com status rastreado pelo usuario via chat, sem disparo
--     automatico. data_hora e opcional e so serve de referencia (prazo).
--
-- Status unificado: 'concluido' significa "ja foi enviado" para lembrete e
-- "usuario marcou como feito" para tarefa - nos dois casos, a pendencia deixou
-- de estar em aberto. Isso permite consultar tudo que esta pendente com uma
-- unica query (ver listarPendencias em src/db/lembrete.ts).
--
-- data_hora e timestamptz (nao date) porque lembrete precisa de hora, nao so
-- dia; para tarefa sem hora definida fica null. Resolvida a partir de
-- linguagem natural assumindo fuso fixo America/Sao_Paulo - nao ha timezone
-- por usuario hoje em nenhuma outra parte do app.

create table lembrete (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,

    tipo            text not null check (tipo in ('lembrete', 'tarefa')),
    descricao       text not null,
    data_hora       timestamptz,
    recorrencia     text check (recorrencia in ('diaria', 'semanal', 'mensal', 'anual')),

    status          text not null default 'pendente'
                        check (status in ('pendente', 'concluido', 'cancelado')),
    concluido_em    timestamptz,

    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now(),

    -- lembrete sempre precisa de data_hora; tarefa e livre.
    check (tipo <> 'lembrete' or data_hora is not null),
    -- recorrencia so faz sentido pra lembrete.
    check (recorrencia is null or tipo = 'lembrete')
);

create index idx_lembrete_usuario_status on lembrete (usuario_id, status, data_hora);
create index idx_lembrete_disparo on lembrete (data_hora) where tipo = 'lembrete' and status = 'pendente';
