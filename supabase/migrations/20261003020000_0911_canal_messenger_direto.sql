-- 0911 · Messenger direto — a página do Facebook conectada pelo app da Meta da
-- instalação, sem intermediário.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- Um provedor de canal de mensagem novo, `meta_messenger`, ao lado de `waha`,
-- `meta_cloud`, `zernio`, `zernio_social` e `datafy`. Até aqui o Messenger só
-- chegava ao inbox por `zernio_social` — um serviço pago no meio do caminho.
-- Agora a página é conectada pelo login do Facebook e fala direto com a Graph
-- API, com o token DA PÁGINA cifrado na própria sessão do canal.
--
-- Colunas do provider, nullable e vazias em toda instalação que não conectar
-- página nenhuma:
--   `messenger_page_id`              — o id da página; é o sessionRef do canal.
--   `messenger_page_token_encrypted` — token da página (fn_encrypt_oauth).
--
-- ─── Por que recriar os CHECKs inteiros ─────────────────────────────────────
-- Mesma regra da 0131/0387: `channel_sessions_provider_check` é o vocabulário
-- fechado, `channel_sessions_provider_ref_check` exige a coluna do provider da
-- vez NOT NULL, e `webhook_events_log_provider_check` precisa do valor para o
-- arquivo do corpo cru aceitar a linha. drop+add, nunca
-- `exception when duplicate_object`. Alargamento puro nos três: nada a
-- preencher antes.
--
-- ─── Índice único entre ativos ──────────────────────────────────────────────
-- A Meta entrega os avisos de TODAS as páginas numa URL só, por app; quem acha a
-- sessão é o `entry.id` (a página). Duas organizações com a mesma página ativa
-- fariam a entrega cair na errada — ou em nenhuma (`PGRST116`). Desenho da 0165,
-- com a dedup por sufixo antes do índice para o `update.sh` consertar em vez de
-- quebrar.

alter table public.channel_sessions
  add column if not exists messenger_page_id text,
  add column if not exists messenger_page_token_encrypted bytea;

comment on column public.channel_sessions.messenger_page_id is
  'Id da página do Facebook no canal Messenger direto. É o sessionRef deste canal e a chave do roteamento do webhook (entry.id). Espelhado em lib/channels/session-ref.ts.';
comment on column public.channel_sessions.messenger_page_token_encrypted is
  'Token da PÁGINA (derivado do token de longa duração de quem conectou; não expira), cifrado por fn_encrypt_oauth. Nunca volta à tela.';

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_check
    check (provider in ('waha', 'meta_cloud', 'zernio', 'zernio_social', 'wacalls', 'datafy', 'meta_messenger'));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha' and waha_session_name is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls' and wacalls_session_id is not null) or
    (provider = 'datafy' and datafy_phone_number_id is not null) or
    (provider = 'meta_messenger' and messenger_page_id is not null)
  );

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'meta_messenger'
  ));

with ativos as (
  select id,
         row_number() over (
           partition by messenger_page_id
           order by created_at desc nulls last, id desc
         ) as posicao
    from public.channel_sessions
   where archived_at is null
     and messenger_page_id is not null
)
update public.channel_sessions s
   set messenger_page_id = s.messenger_page_id || '-conflito-' || s.id::text
  from ativos a
 where a.id = s.id
   and a.posicao > 1;

create unique index if not exists channel_sessions_messenger_page_id_ativo_unique
  on public.channel_sessions (messenger_page_id)
  where archived_at is null and messenger_page_id is not null;

notify pgrst, 'reload schema';
