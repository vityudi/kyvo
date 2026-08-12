-- Limite opcional de quantas vezes um lancamento futuro recorrente se
-- repete (ver criar_lancamento_futuro em src/lib/tools.ts e o controle de
-- repeticao no formulario do painel web). null = repete indefinidamente
-- ("Sempre"), mesmo comportamento de antes desta coluna existir.
--
-- Guarda quantas ocorrencias (contando a propria linha) ainda restam;
-- confirmarLancamentoFuturo (src/db/lancamentoFuturo.ts) decrementa a cada
-- confirmacao e para de gerar a proxima ocorrencia - cancelando tambem o
-- lembrete vinculado - quando chega a zero.
alter table lancamento_futuro
    add column repeticoes_restantes integer check (repeticoes_restantes is null or repeticoes_restantes > 0);
