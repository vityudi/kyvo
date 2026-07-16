-- Restringe quem pode conversar com o bot a um unico chat_id "dono" - protecao
-- de acesso para um bot de uso pessoal (ver src/routes/telegram.ts). Nulo
-- (padrao) mantem o comportamento permissivo anterior, mesmo raciocinio do
-- webhook_secret_cifrado opcional.

alter table telegram_config add column owner_chat_id bigint;
