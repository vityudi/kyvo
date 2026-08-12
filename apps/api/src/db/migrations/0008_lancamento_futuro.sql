-- Lancamentos futuros: despesas/receitas conhecidas com antecedencia (ex.:
-- aluguel todo dia 10, uma assinatura, um salario esperado) que o usuario
-- quer ver planejadas antes de acontecerem de fato - aba "Lancamentos
-- futuros" no painel web, separada do extrato real (tabela `transacao`).
--
-- Deliberadamente NAO afetam saldo/resumo/anomalias (que continuam so sobre
-- `transacao`) e NAO se convertem em transacao automaticamente quando a data
-- chega - o usuario confirma no chat/painel (ver confirmar_lancamento_futuro
-- em src/lib/tools.ts), que so entao registra a transacao real com o valor
-- efetivamente pago. Isso evita que uma previsao de valor errado entre no
-- extrato sem o usuario perceber.
--
-- Cada lancamento futuro cria um `lembrete` vinculado (mesmo mecanismo de
-- notificacao proativa via Telegram que lembrete/tarefa ja usam - ver
-- 0004_lembrete.sql e scheduler.ts) para avisar o usuario na data prevista.

create table lancamento_futuro (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    conta_id        uuid not null references conta(id) on delete cascade,

    tipo            text not null check (tipo in ('despesa', 'receita')),
    valor           numeric(12, 2) not null check (valor > 0),
    categoria       text not null,
    descricao       text,
    fonte           text, -- so usado quando tipo = 'receita', mesmo padrao de transacao.fonte

    data_prevista   date not null,
    recorrencia     text check (recorrencia in ('diaria', 'semanal', 'mensal', 'anual')),

    status          text not null default 'pendente' check (status in ('pendente', 'lancado', 'cancelado')),
    -- preenchidos quando confirmado (ver confirmar_lancamento_futuro): aponta
    -- para a transacao real criada a partir desta previsao.
    transacao_id    uuid references transacao(id) on delete set null,
    -- lembrete que notifica o usuario na data prevista - cancelado junto se o
    -- lancamento futuro for cancelado ou confirmado antes de disparar.
    lembrete_id     uuid references lembrete(id) on delete set null,

    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_lancamento_futuro_usuario_status on lancamento_futuro (usuario_id, status, data_prevista);
