-- Permite existir o (unico) usuario antes de qualquer contato pelo Telegram,
-- pra dar pra conversar pelo painel web so com um provedor de IA configurado
-- - telegram_chat_id fica null ate a pessoa falar com o bot pela primeira
-- vez, quando obterOuCriarUsuario (db/usuario.ts) amarra o chat id a esse
-- mesmo usuario em vez de criar um segundo (app e single-tenant).
alter table usuario alter column telegram_chat_id drop not null;
