-- Dedup de importacao de extrato: evita duplicar lancamentos se o mesmo
-- extrato (ou um com periodo sobreposto) for reenviado. So preenchido pelo
-- fluxo de importacao - indice parcial pra nao pesar o caso comum (chat).
alter table transacao add column origem_hash text;
create unique index idx_transacao_origem_hash
  on transacao (usuario_id, origem_hash)
  where origem_hash is not null;

-- Numero da parcela (compra parcelada no cartao) - informativo, usado so
-- pra exibir "parcela 2/3" ao consultar/listar; nao afeta calculo de saldo
-- (cada parcela ja e uma transacao/fatura propria).
alter table transacao add column parcela_atual integer;
alter table transacao add column parcela_total integer;
