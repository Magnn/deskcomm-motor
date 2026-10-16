-- 0931 — CANAL OFICIAL: quando vence o token do número.
--
-- Por que existe: em 16/10/2026 a Meta só oferecia, para o app novo da
-- instalação, a configuração do Cadastro Incorporado com token de 60 dias (a
-- opção "Nunca" fica travada até o app virar Provedor de Tecnologia). Antes o
-- sistema recusava esse token; agora aceita, guarda quando ele vence e o cron
-- `meta-tokens` o renova antes (`oauth/access_token` com
-- `set_token_expires_in_60_days`). Nulo = não vence ou não se sabe (token colado).
--
-- Aditiva e idempotente; sem dado a corrigir.

alter table public.channel_sessions add column if not exists meta_token_expires_at timestamptz;

create index if not exists channel_sessions_meta_token_vence_idx
  on public.channel_sessions (meta_token_expires_at)
  where meta_token_expires_at is not null and archived_at is null;

comment on column public.channel_sessions.meta_token_expires_at is
  'Quando vence o token do canal oficial (Meta). Nulo = não vence ou desconhecido. Renovado pelo cron meta-tokens.';
