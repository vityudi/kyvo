-- Cartoes de credito e faturas - fecha o ciclo de `conta` (ate aqui so um
-- stub de schema sem CRUD, ver db/conta.ts) permitindo cadastrar cartoes
-- dentro dela e acumular as compras no credito na fatura do ciclo corrente.
--
-- dia_fechamento (1-31): dia do mes em que a fatura para de acumular novas
-- compras e fecha para pagamento (conceito real de cartao de credito
-- brasileiro, distinto do vencimento) - modelado explicitamente em vez de
-- inferido, porque calcular o ciclo certo da fatura sem ele obrigaria
-- adivinhar uma janela arbitraria.
-- dia_vencimento (1-31): dia em que a fatura fechada deve ser paga.

create table cartao (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuario(id) on delete cascade,
    conta_id        uuid not null references conta(id) on delete cascade,

    nome            text not null, -- apelido, ex.: "Nubank", "Inter Gold"
    dia_fechamento  integer not null check (dia_fechamento between 1 and 31),
    dia_vencimento  integer not null check (dia_vencimento between 1 and 31),

    ativo           boolean not null default true,
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

create index idx_cartao_usuario on cartao (usuario_id);
create index idx_cartao_conta on cartao (conta_id);

-- Fatura: um ciclo mensal de fechamento de um cartao. `valor` NAO existe
-- como coluna - o total e sempre soma(transacao.valor) where fatura_id = id
-- (ver db/fatura.ts::valorFatura), mesmo padrao ja usado por
-- resumoPeriodo/consultarSaldo em db/transacao.ts (evita desnormalizacao/
-- dessincronia).
create table fatura (
    id                      uuid primary key default gen_random_uuid(),
    usuario_id              uuid not null references usuario(id) on delete cascade,
    cartao_id               uuid not null references cartao(id) on delete cascade,

    data_fechamento         date not null,
    data_vencimento         date not null,

    status                  text not null default 'aberta' check (status in ('aberta', 'fechada', 'paga')),
    -- preenchido quando status = 'paga' - a transacao real do pagamento.
    transacao_pagamento_id  uuid references transacao(id) on delete set null,

    criado_em               timestamptz not null default now(),
    atualizado_em           timestamptz not null default now()
);

create index idx_fatura_usuario on fatura (usuario_id);
create index idx_fatura_cartao_status on fatura (cartao_id, status);
-- No maximo 1 fatura 'aberta' por cartao ao mesmo tempo.
create unique index idx_fatura_cartao_aberta on fatura (cartao_id) where status = 'aberta';

-- Vincula uma transacao de despesa a fatura do cartao em que foi comprada -
-- nulo = pagamento em dinheiro/debito/pix (nao entra em nenhuma fatura). E
-- por essa coluna, e so ela, que o sistema infere "isso foi credito" - sem
-- enum forma_pagamento separado (cartao_id chega-se via fatura.cartao_id,
-- evita duas fontes de verdade).
alter table transacao add column fatura_id uuid references fatura(id) on delete set null;
create index idx_transacao_fatura on transacao (fatura_id);

-- Amarra um lancamento_futuro a fatura que ele representa. Quando fatura_id
-- esta preenchido, o `valor` armazenado nessa linha e so um snapshot da
-- criacao - toda leitura (db/lancamentoFuturo.ts) SEMPRE sobrescreve com
-- soma(transacao.valor) where transacao.fatura_id = lf.fatura_id, para a
-- fatura em aberto crescer sozinha a cada nova compra no credito sem exigir
-- edicao manual. editar/cancelar sao bloqueados para esses lancamentos (so
-- confirmar, que fecha a fatura como paga).
alter table lancamento_futuro add column fatura_id uuid references fatura(id) on delete set null;
create unique index idx_lancamento_futuro_fatura on lancamento_futuro (fatura_id) where fatura_id is not null;

-- Categoria fixa usada no pagamento de fatura (transacao real criada por
-- confirmar_lancamento_futuro) - criada pelo sistema, nao pelo usuario, mas
-- ainda assim precisa existir na tabela `categoria` para bater com
-- categoriaValida() chamado por registrarDespesa.
insert into categoria (usuario_id, nome, tipo) values (null, 'fatura de cartão', 'despesa');
