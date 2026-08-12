-- Identifica o banco/emissor do cartao para o painel web desenhar o cartao
-- com a cor de marca real (ver apps/web/src/lib/bancos.ts) - so estetico,
-- nao afeta nenhuma regra de negocio (ciclo de fatura, etc). Nulo = sem
-- banco identificado, o painel usa um visual generico.
alter table cartao add column banco text;
