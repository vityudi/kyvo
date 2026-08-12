-- Transacoes passam a guardar a hora do evento, nao so o dia: antes so
-- havia `data date`, entao duas transacoes no mesmo dia ficavam ordenadas
-- pela ordem de insercao (criado_em), nao pelo horario real da transacao.
-- `data_hora` (timestamptz) passa a ser a fonte de verdade; `data` continua
-- existindo, mas agora como coluna gerada a partir dela (data local em
-- America/Sao_Paulo) - assim as queries existentes que filtram/agrupam por
-- `data` (date_trunc, between, to_char - ver src/db/transacao.ts e
-- src/db/anomalias.ts) continuam funcionando sem alteracao.
--
-- Fuso fixo America/Sao_Paulo, mesmo padrao ja usado em lembrete.data_hora
-- (resolverDataHoraLocalSp em src/lib/tempo.ts) - Brasil sem horario de
-- verao desde 2019, sem timezone por usuario em nenhuma parte do app.

alter table transacao add column data_hora timestamptz;

-- Backfill: transacoes antigas so tinham `data` (sem hora). Aproxima o
-- horario real usando a hora de criado_em (quando a transacao foi lancada
-- no sistema) - melhor aproximacao disponivel para dados existentes, mesmo
-- nao sendo o horario exato do evento em si.
update transacao
   set data_hora = (data + (criado_em at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo';

alter table transacao alter column data_hora set not null;
alter table transacao alter column data_hora set default now();

-- Remove `data` (dropar a coluna tambem remove o indice idx_transacao_usuario_data
-- automaticamente) e recria como coluna gerada a partir de data_hora.
alter table transacao drop column data;
alter table transacao add column data date
    generated always as ((data_hora at time zone 'America/Sao_Paulo')::date) stored;

create index idx_transacao_usuario_data on transacao (usuario_id, data desc);
create index idx_transacao_usuario_data_hora on transacao (usuario_id, data_hora desc);
