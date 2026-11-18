-- manifest: **Número oficial conectado por link de cadastro, pela conta da instalação num segundo provedor parceiro.** `channel_sessions` ganha `kapso_phone_number_id` (o `phone_number_id` da Meta, que é o sessionRef do canal), `kapso_waba_id`, `kapso_customer_id` (o cliente que a instalação criou no provedor para esta organização) e `kapso_webhook_id` (a assinatura de webhook do número). O provider `kapso` entra nos CHECKs `channel_sessions_provider_check`, `channel_sessions_provider_ref_check` e `webhook_events_log_provider_check`, e um índice único impede dois canais ativos no mesmo número.
--
-- ═══ O que muda para quem opera ═══
--
-- Um segundo provedor parceiro homologado pela Meta, com a API no mesmo
-- formato da Cloud API. A instalação guarda UMA chave (painel de
-- configuração); cada organização vira um cliente no provedor e conecta o
-- número por um link de cadastro (Facebook + coexistência com o app do
-- WhatsApp Business). Na volta, o servidor confere que o número é daquele
-- cliente e registra o webhook do número, com segredo gerado aqui.
--
-- ═══ Por que não há coluna de token ═══
--
-- A chave é da INSTALAÇÃO e é lida na hora (como na 0964): copiar para cada
-- sessão faria N cópias do mesmo segredo, e trocar a chave deixaria as
-- conexões falando com a antiga.
--
-- Idempotente: `add column if not exists`, constraints recriadas por nome,
-- dedup antes do índice único. Alargamento puro dos CHECKs: linha que passava
-- antes continua passando, sem backfill.

alter table public.channel_sessions
  add column if not exists kapso_phone_number_id text,
  add column if not exists kapso_waba_id text,
  add column if not exists kapso_customer_id text,
  add column if not exists kapso_webhook_id text;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'wacalls'::text, 'zernio_social'::text, 'datafy'::text, 'meta_messenger'::text, 'telegram_bot'::text, 'kapso'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name    is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id    is not null) or
    (provider = 'datafy'     and datafy_phone_number_id is not null) or
    (provider = 'meta_messenger' and messenger_page_id is not null) or
    (provider = 'telegram_bot' and telegram_bot_id is not null) or
    (provider = 'kapso'      and kapso_phone_number_id is not null)
  );

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'meta_messenger', 'telegram_bot', 'kapso'
  ));

with ativos as (
  select id,
         row_number() over (
           partition by kapso_phone_number_id
           order by created_at desc nulls last, id desc
         ) as posicao
    from public.channel_sessions
   where archived_at is null
     and kapso_phone_number_id is not null
)
update public.channel_sessions s
   set kapso_phone_number_id = s.kapso_phone_number_id || '-conflito-' || s.id::text
  from ativos a
 where a.id = s.id
   and a.posicao > 1;

create unique index if not exists channel_sessions_kapso_phone_number_id_ativo_unique
  on public.channel_sessions (kapso_phone_number_id)
  where archived_at is null and kapso_phone_number_id is not null;

comment on column public.channel_sessions.kapso_phone_number_id is
  'phone_number_id da Meta no segundo provedor parceiro (link de cadastro). É o sessionRef deste canal. Espelhado em lib/channels/session-ref.ts. Migration 0965.';
comment on column public.channel_sessions.kapso_customer_id is
  'Cliente que a instalação criou no provedor para esta organização. A volta do cadastro só aceita número deste cliente. Migration 0965.';
comment on column public.channel_sessions.kapso_webhook_id is
  'Assinatura de webhook do número, registrada pela instalação com segredo gerado aqui (webhook_secret_encrypted). Migration 0965.';

-- A ligação com o provedor é do SERVIDOR (mesma régua da 0964): com a chave da
-- instalação, um `kapso_phone_number_id` trocado pela REST faria uma organização
-- enviar pelo número de outra. `anon`/`authenticated` não gravam essas colunas,
-- nem criam, arquivam, movem ou apagam linha deste provider.
create or replace function public.fn_channel_sessions_ligacao_ao_provedor_e_do_servidor()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    -- `new` é nulo no DELETE: devolvê-lo cancelaria a exclusão do servidor.
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.zernio_credencial_da_instalacao or old.provider = 'kapso' then
      raise exception 'canal_ligacao_ao_provedor_e_do_servidor' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.zernio_credencial_da_instalacao
       or new.zernio_account_id is not null
       or new.zernio_profile_id is not null
       or new.zernio_webhook_id is not null
       or new.provider = 'kapso'
       or new.kapso_phone_number_id is not null
       or new.kapso_customer_id is not null
       or new.kapso_webhook_id is not null then
      raise exception 'canal_ligacao_ao_provedor_e_do_servidor' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.zernio_credencial_da_instalacao, new.zernio_account_id, new.zernio_profile_id, new.zernio_webhook_id)
       is distinct from
     (old.zernio_credencial_da_instalacao, old.zernio_account_id, old.zernio_profile_id, old.zernio_webhook_id)
     or (new.kapso_phone_number_id, new.kapso_waba_id, new.kapso_customer_id, new.kapso_webhook_id)
       is distinct from
     (old.kapso_phone_number_id, old.kapso_waba_id, old.kapso_customer_id, old.kapso_webhook_id)
     or ((old.zernio_credencial_da_instalacao or old.provider = 'kapso') and
         (new.archived_at, new.provider, new.organization_id, new.phone_number)
           is distinct from
         (old.archived_at, old.provider, old.organization_id, old.phone_number)) then
    raise exception 'canal_ligacao_ao_provedor_e_do_servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;
