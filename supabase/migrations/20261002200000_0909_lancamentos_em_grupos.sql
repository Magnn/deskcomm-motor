-- 0909 — LANÇAMENTOS EM GRUPOS de WhatsApp.
--
-- Quem faz lançamento junta os interessados em grupos e fala com todos de uma vez. Um grupo do WhatsApp
-- tem teto de participantes, então um lançamento são VÁRIOS grupos — e o anúncio precisa de UM link só,
-- que mande cada pessoa para o grupo que ainda tem vaga. Cinco tabelas:
--
--   group_launches            o lançamento: de qual número, como nomear os grupos, a lotação, o link público
--   group_launch_groups       cada grupo criado, na ordem, com o convite e a contagem de participantes
--   group_launch_broadcasts   um disparo agendado para todos os grupos (os mesmos itens de conteúdo do fluxo)
--   group_launch_deliveries   o desfecho do disparo em cada grupo — é o que impede mandar duas vezes
--   group_launch_clicks       um clique no link público, uma linha: contar por linha não perde clique em rajada
--
-- RLS ligada com ZERO policies e grants revogados de anon/authenticated nas cinco: quem lê e escreve é o
-- servidor (`lib/lancamentos/`), sempre filtrando `organization_id`. O link público resolve pelo `slug` sem
-- sessão — com policy de tenant ele não funcionaria, e com policy aberta vazaria o convite de todo mundo.
-- Nenhuma função nova em `public` ⇒ item 9 da doutrina de migrations não é acionado.
--
-- Idempotente e auto-curativo: o `update.sh` re-aplica o baseline inteiro num banco existente.

create table if not exists public.group_launches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  name text not null,
  slug text not null,
  group_name_template text not null,
  group_description text,
  group_capacity integer not null default 900,
  admins_only boolean not null default true,
  seed_participant text not null,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_launches_status_conhecido check (status in ('active', 'paused', 'archived')),
  constraint group_launches_capacity_no_teto check (group_capacity between 2 and 1024),
  constraint group_launches_slug_forma check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  constraint group_launches_seed_forma check (seed_participant ~ '^[0-9]{10,15}$')
);

create unique index if not exists group_launches_slug_uk on public.group_launches (slug);
create index if not exists group_launches_org_idx on public.group_launches (organization_id, created_at desc);

create table if not exists public.group_launch_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null references public.group_launches(id) on delete cascade,
  position integer not null,
  wa_group_id text not null,
  name text not null,
  invite_url text,
  members_count integer not null default 0,
  members_checked_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_launch_groups_status_conhecido check (status in ('open', 'full', 'closed')),
  constraint group_launch_groups_position_positiva check (position >= 1)
);

create unique index if not exists group_launch_groups_launch_position_uk
  on public.group_launch_groups (launch_id, position);
create unique index if not exists group_launch_groups_org_wa_uk
  on public.group_launch_groups (organization_id, wa_group_id);

create table if not exists public.group_launch_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null references public.group_launches(id) on delete cascade,
  items jsonb not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  claimed_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_launch_broadcasts_status_conhecido
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  constraint group_launch_broadcasts_items_lista check (jsonb_typeof(items) = 'array')
);

create index if not exists group_launch_broadcasts_vencidos_idx
  on public.group_launch_broadcasts (scheduled_at)
  where status in ('scheduled', 'sending');
create index if not exists group_launch_broadcasts_launch_idx
  on public.group_launch_broadcasts (launch_id, scheduled_at desc);

create table if not exists public.group_launch_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  broadcast_id uuid not null references public.group_launch_broadcasts(id) on delete cascade,
  group_id uuid not null references public.group_launch_groups(id) on delete cascade,
  status text not null default 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_launch_deliveries_status_conhecido check (status in ('pending', 'sent', 'failed'))
);

create unique index if not exists group_launch_deliveries_broadcast_group_uk
  on public.group_launch_deliveries (broadcast_id, group_id);

create table if not exists public.group_launch_clicks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null references public.group_launches(id) on delete cascade,
  group_id uuid references public.group_launch_groups(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists group_launch_clicks_launch_idx
  on public.group_launch_clicks (launch_id, created_at desc);

alter table public.group_launches enable row level security;
alter table public.group_launch_groups enable row level security;
alter table public.group_launch_broadcasts enable row level security;
alter table public.group_launch_deliveries enable row level security;
alter table public.group_launch_clicks enable row level security;

revoke all on public.group_launches from anon, authenticated;
revoke all on public.group_launch_groups from anon, authenticated;
revoke all on public.group_launch_broadcasts from anon, authenticated;
revoke all on public.group_launch_deliveries from anon, authenticated;
revoke all on public.group_launch_clicks from anon, authenticated;

grant select, insert, update, delete on public.group_launches to service_role;
grant select, insert, update, delete on public.group_launch_groups to service_role;
grant select, insert, update, delete on public.group_launch_broadcasts to service_role;
grant select, insert, update, delete on public.group_launch_deliveries to service_role;
grant select, insert, update, delete on public.group_launch_clicks to service_role;

drop trigger if exists trg_group_launches_updated_at on public.group_launches;
create trigger trg_group_launches_updated_at
  before update on public.group_launches
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_group_launch_groups_updated_at on public.group_launch_groups;
create trigger trg_group_launch_groups_updated_at
  before update on public.group_launch_groups
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_group_launch_broadcasts_updated_at on public.group_launch_broadcasts;
create trigger trg_group_launch_broadcasts_updated_at
  before update on public.group_launch_broadcasts
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_group_launch_deliveries_updated_at on public.group_launch_deliveries;
create trigger trg_group_launch_deliveries_updated_at
  before update on public.group_launch_deliveries
  for each row execute function public.fn_set_updated_at();
