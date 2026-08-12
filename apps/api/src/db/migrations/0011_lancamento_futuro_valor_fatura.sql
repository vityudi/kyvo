-- obterOuCriarFaturaAberta (db/fatura.ts) cria o lancamento_futuro pareado
-- de uma fatura ANTES da primeira compra ser inserida (precisa do id da
-- fatura para gravar na transacao) - nesse momento o valor real ainda e
-- desconhecido e so seria zero mesmo, ja que o valor da fatura e sempre
-- recalculado por SUM na leitura (ver db/lancamentoFuturo.ts) e nunca lido
-- da coluna quando fatura_id esta preenchido. A constraint original (valor >
-- 0) foi pensada so para lancamentos futuros "normais", que sempre tem um
-- valor previsto informado pelo usuario na criacao.
alter table lancamento_futuro drop constraint lancamento_futuro_valor_check;
alter table lancamento_futuro add constraint lancamento_futuro_valor_check
    check ((fatura_id is not null and valor >= 0) or (fatura_id is null and valor > 0));
