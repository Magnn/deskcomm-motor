-- 0908 — a ASSINATURA de cada organização (plano pago que libera conectar número).
--
-- Quem vende a instalação como serviço deixa o cliente criar conta, fluxos e agentes de graça, e cobra na
-- hora de CONECTAR UM NÚMERO. O plano contratado e se ele está em dia moram aqui — uma linha por organização.
--
-- Tabela PRÓPRIA, e não uma chave em `organizations.settings`: várias rotas regravam `settings` inteiro
-- (ler → alterar → gravar), e uma gravação concorrente apagaria o plano de quem acabou de pagar. Aqui só
-- escreve o aviso de pagamento e o painel do dono da instalação.
--
-- RLS ligada com ZERO policies e grants revogados de anon/authenticated: o cliente não pode se dar um plano.
-- Só o service_role alcança (server-side). Nenhuma função nova em `public` ⇒ item 9 da doutrina de
-- migrations não é acionado.
--
-- Idempotente e auto-curativo: o `update.sh` re-aplica o baseline inteiro num banco existente.

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id text not null,
  status text not null default 'ativa',
  source text not null,
  reference text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint organization_subscriptions_status_conhecido check (status in ('ativa', 'inativa')),
  constraint organization_subscriptions_source_conhecida check (source in ('cakto', 'manual')),
  constraint organization_subscriptions_plan_id_forma check (plan_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$')
);

create unique index if not exists organization_subscriptions_org_uk
  on public.organization_subscriptions (organization_id);

alter table public.organization_subscriptions enable row level security;
revoke all on public.organization_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.organization_subscriptions to service_role;

drop trigger if exists trg_organization_subscriptions_updated_at on public.organization_subscriptions;
create trigger trg_organization_subscriptions_updated_at
  before update on public.organization_subscriptions
  for each row execute function public.fn_set_updated_at();
