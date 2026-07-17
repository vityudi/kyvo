-- Config do bot do Telegram, editavel via painel /web (mesmo padrao de
-- llm_provedor: segredo cifrado no banco em vez de variavel de ambiente).
-- Singleton (id fixo) - so existe um bot por instancia do Kyvo.

create table telegram_config (
    id                      boolean primary key default true check (id),
    bot_token_cifrado       text,
    webhook_secret_cifrado  text,
    atualizado_em           timestamptz not null default now()
);

insert into telegram_config (id) values (true);
