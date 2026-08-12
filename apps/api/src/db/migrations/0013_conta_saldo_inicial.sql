-- Saldo inicial informado pelo usuario ao cadastrar a conta (ex.: ja tinha
-- R$ 500 quando comecou a usar o Kyvo) - o saldo total exibido no painel
-- passa a ser saldo_inicial + soma(receitas) - soma(despesas), em vez de so
-- a soma das transacoes registradas (ver db/conta.ts).
alter table conta add column saldo_inicial numeric(12, 2) not null default 0;
