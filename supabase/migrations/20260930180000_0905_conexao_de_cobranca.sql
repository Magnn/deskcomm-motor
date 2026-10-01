-- 0905 — conexão com o provedor de COBRANÇA (nó "Cobrança" do fluxo).
--
-- Uma linha por (organização, provedor): a chave de API cifrada por `fn_encrypt_oauth` (a MESMA cifra de
-- `ad_platform_connections`, `calendar_connections` e `lib/webhooks/secrets.ts` — sem terceiro caminho) e o
-- ambiente (produção ou sandbox). Escopo de ORGANIZAÇÃO: a conta de cobrança é do negócio, e uma agência com
-- dois clientes na mesma VPS cobraria de um na conta do outro.
--
-- RLS ligada com ZERO policies e grants revogados de anon/authenticated: a chave emite cobrança em nome do
-- cliente, e vazá-la deixa terceiro criar cobranças na conta dele. Só o service_role alcança (server-side).
-- Nenhuma função nova em `public` ⇒ item 9 da doutrina de migrations não é acionado.
--
-- Idempotente e auto-curativo: o `update.sh` re-aplica o baseline inteiro num banco existente.

create table if not exists public.payment_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  api_key_encrypted text,
  environment text not null default 'production',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint payment_gateway_connections_provider_conhecido check (provider in ('asaas')),
  constraint payment_gateway_connections_environment_conhecido check (environment in ('production', 'sandbox'))
);

create unique index if not exists payment_gateway_connections_org_provider_uk
  on public.payment_gateway_connections (organization_id, provider);

alter table public.payment_gateway_connections enable row level security;
revoke all on public.payment_gateway_connections from anon, authenticated;
grant select, insert, update, delete on public.payment_gateway_connections to service_role;

drop trigger if exists trg_payment_gateway_connections_updated_at on public.payment_gateway_connections;
create trigger trg_payment_gateway_connections_updated_at
  before update on public.payment_gateway_connections
  for each row execute function public.fn_set_updated_at();
