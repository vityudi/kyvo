-- Chave da Groq (transcricao de audio via Whisper), editavel via painel
-- /web em vez de variavel de ambiente - mesmo padrao de telegram_config
-- (segredo cifrado no banco, singleton com id fixo).

create table groq_config (
    id                  boolean primary key default true check (id),
    api_key_cifrada     text,
    atualizado_em       timestamptz not null default now()
);

insert into groq_config (id) values (true);
