-- 0912 · Telegram — o bot da empresa atendendo pelo CRM.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- Um provedor de canal de mensagem novo, `telegram_bot`. A empresa cria o bot no
-- BotFather e cola o token; o CRM fala direto com a Bot API. Cada bot é uma
-- linha de `channel_sessions`, e o webhook dele aponta para a rota genérica por
-- token (`/api/v1/webhooks/channel/<token>`), com o segredo conferido no
-- cabeçalho que o Telegram manda.
--
-- Colunas do provider, nullable e vazias em quem não conecta bot:
--   `telegram_bot_id`              — o id numérico do bot; é o sessionRef.
--   `telegram_bot_token_encrypted` — o token do BotFather (fn_encrypt_oauth).
--
-- ─── Os quatro CHECKs ───────────────────────────────────────────────────────
-- drop+add, como a 0131/0387/0911: `channel_sessions_provider_check` e
-- `_provider_ref_check` (provider e a coluna dele), `webhook_events_log_provider_check`
-- (o corpo cru é arquivado com o provider da sessão) e `conversations_channel_check`
-- — a conversa grava o CANAL ('telegram'), e sem o valor o primeiro webhook
-- voltaria 23514 para sempre. Alargamento puro nos quatro.
--
-- ─── Índice único entre ativos ──────────────────────────────────────────────
-- Um bot tem UM webhook no Telegram: conectado em duas organizações, a segunda
-- conexão roubaria a entrega da primeira em silêncio. Desenho da 0165, com dedup
-- por sufixo antes.

alter table public.channel_sessions
  add column if not exists telegram_bot_id text,
  add column if not exists telegram_bot_token_encrypted bytea;

comment on column public.channel_sessions.telegram_bot_id is
  'Id numérico do bot do Telegram (getMe). É o sessionRef deste canal. Espelhado em lib/channels/session-ref.ts.';
comment on column public.channel_sessions.telegram_bot_token_encrypted is
  'Token do bot (BotFather), cifrado por fn_encrypt_oauth. Nunca volta à tela.';

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_check
    check (provider in ('waha', 'meta_cloud', 'zernio', 'zernio_social', 'wacalls', 'datafy', 'meta_messenger', 'telegram_bot'));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha' and waha_session_name is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls' and wacalls_session_id is not null) or
    (provider = 'datafy' and datafy_phone_number_id is not null) or
    (provider = 'meta_messenger' and messenger_page_id is not null) or
    (provider = 'telegram_bot' and telegram_bot_id is not null)
  );

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'meta_messenger', 'telegram_bot'
  ));

alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'instagram', 'facebook', 'telegram'));

with ativos as (
  select id,
         row_number() over (
           partition by telegram_bot_id
           order by created_at desc nulls last, id desc
         ) as posicao
    from public.channel_sessions
   where archived_at is null
     and telegram_bot_id is not null
)
update public.channel_sessions s
   set telegram_bot_id = s.telegram_bot_id || '-conflito-' || s.id::text
  from ativos a
 where a.id = s.id
   and a.posicao > 1;

create unique index if not exists channel_sessions_telegram_bot_id_ativo_unique
  on public.channel_sessions (telegram_bot_id)
  where archived_at is null and telegram_bot_id is not null;

notify pgrst, 'reload schema';
