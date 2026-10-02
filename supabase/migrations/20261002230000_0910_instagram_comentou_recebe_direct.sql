-- 0910 — INSTAGRAM: comentou na publicação, recebe uma mensagem no direct.
--
-- A conta do Instagram é conectada direto na Meta (login do Instagram), e cada organização monta regras:
-- "quem comentar X nesta publicação recebe esta mensagem no direct — e, se eu quiser, uma resposta pública".
--
--   instagram_connections      a conta conectada: quem ela é e o token (cifrado) que fala por ela
--   instagram_comment_rules    a regra: em quais publicações, com quais palavras, o que responder
--   instagram_comment_events   cada comentário ATENDIDO — é o registro e a trava contra responder duas vezes
--
-- RLS ligada com ZERO policies e grants revogados de anon/authenticated nas três: a conexão guarda o token
-- que publica e manda direct em nome da conta, e o aviso de comentário chega da Meta SEM sessão — quem acha
-- a conexão é o servidor, pelo id da conta. Nenhuma função nova em `public` ⇒ item 9 da doutrina de
-- migrations não é acionado.
--
-- Idempotente e auto-curativo: o `update.sh` re-aplica o baseline inteiro num banco existente.

create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ig_id text not null,
  ig_user_id text not null,
  username text not null,
  name text,
  profile_picture_url text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  status text not null default 'active',
  status_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_connections_status_conhecido check (status in ('active', 'error'))
);

-- Uma conta do Instagram pertence a UMA organização da instalação: o aviso de comentário traz só o id da
-- conta, e com duas organizações na mesma conta não haveria como saber de quem é a regra.
create unique index if not exists instagram_connections_conta_uk on public.instagram_connections (ig_user_id);
create index if not exists instagram_connections_org_idx on public.instagram_connections (organization_id);

create table if not exists public.instagram_comment_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  post_scope text not null default 'all',
  post_ids text[] not null default '{}',
  match_type text not null default 'contains',
  keywords text[] not null default '{}',
  dm_message text not null,
  public_replies text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_comment_rules_post_scope_conhecido check (post_scope in ('all', 'specific')),
  constraint instagram_comment_rules_match_type_conhecido check (match_type in ('any', 'contains', 'exact')),
  constraint instagram_comment_rules_dm_nao_vazia check (length(btrim(dm_message)) > 0)
);

create index if not exists instagram_comment_rules_conexao_idx
  on public.instagram_comment_rules (connection_id, created_at);

create table if not exists public.instagram_comment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  rule_id uuid references public.instagram_comment_rules(id) on delete set null,
  comment_id text not null,
  media_id text,
  from_id text,
  from_username text,
  comment_text text,
  dm_status text not null default 'pending',
  public_reply_status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_comment_events_dm_status_conhecido check (dm_status in ('pending', 'sent', 'failed')),
  constraint instagram_comment_events_public_reply_status_conhecido
    check (public_reply_status in ('pending', 'sent', 'failed', 'skipped'))
);

-- A trava contra responder duas vezes: a Meta reentrega o mesmo aviso.
create unique index if not exists instagram_comment_events_comentario_uk
  on public.instagram_comment_events (connection_id, comment_id);
create index if not exists instagram_comment_events_org_idx
  on public.instagram_comment_events (organization_id, created_at desc);

alter table public.instagram_connections enable row level security;
alter table public.instagram_comment_rules enable row level security;
alter table public.instagram_comment_events enable row level security;

revoke all on public.instagram_connections from anon, authenticated;
revoke all on public.instagram_comment_rules from anon, authenticated;
revoke all on public.instagram_comment_events from anon, authenticated;

grant select, insert, update, delete on public.instagram_connections to service_role;
grant select, insert, update, delete on public.instagram_comment_rules to service_role;
grant select, insert, update, delete on public.instagram_comment_events to service_role;

drop trigger if exists trg_instagram_connections_updated_at on public.instagram_connections;
create trigger trg_instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_instagram_comment_rules_updated_at on public.instagram_comment_rules;
create trigger trg_instagram_comment_rules_updated_at
  before update on public.instagram_comment_rules
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_instagram_comment_events_updated_at on public.instagram_comment_events;
create trigger trg_instagram_comment_events_updated_at
  before update on public.instagram_comment_events
  for each row execute function public.fn_set_updated_at();
