-- Subitens genericos de uma tarefa (lembrete.tipo = 'tarefa') - permite que o
-- assistente va adicionando/removendo/marcando itens individualmente conforme
-- o usuario pede, sem reescrever a descricao inteira toda vez (o que seria
-- livre demais - contraria o principio de nunca deixar a IA "aproximar"
-- estado que devia vir de uma tool call validada). Usado hoje para lista de
-- compras ("bota arroz na lista", "tira o leite"), mas serve pra qualquer
-- checklist com subitens (ex.: lista de tarefas de uma viagem).
--
-- Nao ha usuario_id aqui de proposito: ownership sempre passa pelo join com
-- lembrete (ver src/db/tarefaItem.ts) - mesma ideia de nao duplicar a fonte
-- da verdade.

create table tarefa_item (
    id              uuid primary key default gen_random_uuid(),
    tarefa_id       uuid not null references lembrete(id) on delete cascade,

    descricao       text not null,
    status          text not null default 'pendente'
                        check (status in ('pendente', 'concluido')),

    criado_em       timestamptz not null default now(),
    concluido_em    timestamptz
);

create index idx_tarefa_item_tarefa on tarefa_item (tarefa_id, status);
