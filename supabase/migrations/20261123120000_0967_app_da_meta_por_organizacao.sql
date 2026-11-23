-- manifest: **App da Meta por organização.** `platform_meta_apps_anteriores` ganha `whatsapp_config_id`, `messenger_config_id` e `ads_config_id` (as configurações do "Login do Facebook para Empresas" DAQUELE app). Tabela nova `platform_meta_app_da_org` (organization_id → app_id): a organização listada conecta WhatsApp (cadastro incorporado), Messenger e anúncios pelo app dela em vez do principal. Server-side only, como a 0933.
--
-- ═══ O caso ═══
--
-- Cada BM com o seu app (a 0933 e o #582 já aceitam os avisos e renovam os
-- tokens de vários apps). Faltava o outro lado: o "Conectar" da organização
-- abria SEMPRE pelo app principal, então a janela da Meta mostrava o nome do
-- app principal — e a análise do app da BM exige mostrar o próprio app.
--
-- ═══ Por que a configuração mora no app e não na organização ═══
--
-- O config_id é do app (é criado no painel dele). Duas organizações no mesmo
-- app usam o mesmo config_id; guardar na organização duplicaria o dado.
--
-- Idempotente; lock_timeout para não enfileirar atrás de transação longa.

set lock_timeout = '5s';

alter table public.platform_meta_apps_anteriores
  add column if not exists whatsapp_config_id text,
  add column if not exists messenger_config_id text,
  add column if not exists ads_config_id text;

create table if not exists public.platform_meta_app_da_org (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  app_id text not null references public.platform_meta_apps_anteriores(app_id) on delete cascade,
  definido_em timestamptz not null default now(),
  definido_por uuid
);

comment on table public.platform_meta_app_da_org is
  'Organizações que conectam WhatsApp, Messenger e anúncios por um app da Meta que NÃO é o principal (um dos apps de platform_meta_apps_anteriores). Ausente = app principal. Configuração da plataforma (gate de admin da plataforma): RLS ligada sem policies, grants revogados de anon/authenticated. Migration 0967.';

alter table public.platform_meta_app_da_org enable row level security;
revoke all on public.platform_meta_app_da_org from anon, authenticated;
grant select, insert, update, delete on public.platform_meta_app_da_org to service_role;

reset lock_timeout;
