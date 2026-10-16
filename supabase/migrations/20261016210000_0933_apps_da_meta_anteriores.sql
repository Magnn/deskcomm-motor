-- 0933 · Trocar o app da Meta não derruba os números do app anterior.
--
-- O QUÊ: `platform_meta_apps_anteriores` guarda a chave (cifrada, a mesma cifra de
-- `platform_meta_app`) de cada app que deixou de ser o app da instalação; e
-- `channel_sessions.meta_app_id` diz por qual app cada número foi conectado.
--
-- POR QUÊ: em 16/10/2026 o dono decidiu rodar um app novo num portfólio limpo (Incoasul) sem
-- esperar a análise do app atual. A Meta assina cada aviso com a chave do app QUE o número usa,
-- e o token de 60 dias do Cadastro Incorporado só renova com a chave desse mesmo app. Com uma
-- chave só na instalação, trocar de app levava todo número conectado pelo anterior a 401 no
-- webhook e, em até 60 dias, a token vencido.
--
-- Aditiva e idempotente: tabela e coluna novas, nula = "o app em vigor" (o comportamento de antes).

-- A troca do app da Meta preserva os números do app anterior (migration 0933).
create table if not exists public.platform_meta_apps_anteriores (
  app_id text primary key,
  app_secret_encrypted text not null,
  aposentado_em timestamptz not null default now(),
  aposentado_por uuid,
  constraint platform_meta_apps_anteriores_app_id_forma check (app_id ~ '^\d{5,25}$')
);

comment on table public.platform_meta_apps_anteriores is
  'Apps da Meta que JÁ foram o app da instalação. A chave (cifrada) continua conferindo a assinatura dos avisos e renovando o token dos números conectados por eles. Server-side only: RLS ligada sem policies, grants revogados de anon/authenticated.';

alter table public.platform_meta_apps_anteriores enable row level security;
revoke all on public.platform_meta_apps_anteriores from anon, authenticated;
grant select, insert, update, delete on public.platform_meta_apps_anteriores to service_role;

alter table public.channel_sessions add column if not exists meta_app_id text;

comment on column public.channel_sessions.meta_app_id is
  'O app da Meta pelo qual o número foi conectado. Nulo = o app em vigor na instalação. É por ele que a renovação do token escolhe a chave certa depois de uma troca de app.';
