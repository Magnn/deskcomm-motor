-- 0928 — ÁREA DO CLIENTE: a página onde quem já comprou vê o que é seu, e onde
-- a empresa mede o que essa pessoa olha, abre, deseja e compra.
--
-- Por que existe: até aqui tudo o que o cliente comprou morava na conversa de
-- WhatsApp. Em 15/10/2026 o número oficial foi banido e 46 pessoas que tinham
-- pagado na semana perderam o acesso ao que compraram. A área tira a entrega de
-- dentro do canal.
--
-- Cinco tabelas, todas novas, todas por organização:
--   area_servicos  — a vitrine: o que a empresa oferece a quem já é cliente;
--   area_convites  — o link de acesso de um contato (o token só existe em hash);
--   area_sessoes   — quem está dentro, em qual aparelho (o cookie só existe em hash);
--   area_codigos   — o código de 6 números mandado por e-mail para entrar de novo;
--   area_eventos   — o rastro: entrou, viu, abriu, clicou para comprar, desejou.
--
-- Quem ESCREVE nas quatro últimas é só o servidor (service role), pelas rotas
-- públicas da área. A equipe lê pela RLS. Nenhuma delas guarda texto livre do
-- cliente fora de `area_eventos.props`, que é limitado pela rota.
--
-- Aditiva e idempotente: nenhuma linha existente muda.

-- ────────────────────────────────────────────────────────────────────────────
-- 1 · a vitrine
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.area_servicos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  descricao text check (descricao is null or char_length(descricao) <= 600),
  recebe text check (recebe is null or char_length(recebe) <= 300),
  preco_cents integer not null check (preco_cents between 100 and 10000000),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  link_checkout text not null check (link_checkout ~ '^https://' and char_length(link_checkout) <= 500),
  destaque boolean not null default false,
  ativo boolean not null default true,
  posicao numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists area_servicos_org_idx on public.area_servicos (organization_id, ativo, posicao);

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · o link de acesso
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.area_convites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token_hash text not null unique,
  criado_por uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  ultimo_uso_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_convites_contato_idx on public.area_convites (organization_id, contact_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 3 · quem está dentro
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.area_sessoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token_hash text not null unique,
  origem text not null check (origem in ('convite', 'codigo')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists area_sessoes_contato_idx on public.area_sessoes (organization_id, contact_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4 · o código por e-mail
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.area_codigos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  code_hash text not null,
  tentativas integer not null default 0,
  expires_at timestamptz not null,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_codigos_contato_idx on public.area_codigos (organization_id, contact_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 5 · o rastro
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.area_eventos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sessao_id uuid references public.area_sessoes(id) on delete set null,
  tipo text not null check (tipo in (
    'convite_criado', 'entrou', 'visitou', 'material_aberto',
    'servico_visto', 'checkout_clicado', 'desejo', 'email_salvo', 'saiu'
  )),
  servico_id uuid references public.area_servicos(id) on delete set null,
  ref text check (ref is null or char_length(ref) <= 120),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists area_eventos_org_tempo_idx on public.area_eventos (organization_id, created_at desc);
create index if not exists area_eventos_org_tipo_idx on public.area_eventos (organization_id, tipo, created_at desc);
create index if not exists area_eventos_contato_idx on public.area_eventos (organization_id, contact_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS: a equipe lê; a vitrine é editada por manager+; o resto só o servidor escreve.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.area_servicos enable row level security;
drop policy if exists tenant_isolation_area_servicos_all on public.area_servicos;
create policy tenant_isolation_area_servicos_all on public.area_servicos
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );

alter table public.area_convites enable row level security;
drop policy if exists tenant_isolation_area_convites_select on public.area_convites;
create policy tenant_isolation_area_convites_select on public.area_convites
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

alter table public.area_sessoes enable row level security;
drop policy if exists tenant_isolation_area_sessoes_select on public.area_sessoes;
create policy tenant_isolation_area_sessoes_select on public.area_sessoes
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

-- O código nem a equipe lê: é segredo de quem recebeu o e-mail.
alter table public.area_codigos enable row level security;

alter table public.area_eventos enable row level security;
drop policy if exists tenant_isolation_area_eventos_select on public.area_eventos;
create policy tenant_isolation_area_eventos_select on public.area_eventos
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

revoke all on public.area_servicos, public.area_convites, public.area_sessoes, public.area_codigos, public.area_eventos from anon;

comment on table public.area_servicos is
  'A vitrine da área do cliente: o que a empresa oferece a quem já comprou. Comprar leva ao link de checkout; a compra volta pelo ledger de receita.';
comment on table public.area_convites is
  'Link de acesso de um contato à área do cliente. O token só existe em hash (sha256); vale até expires_at e pode ser aberto em mais de um aparelho.';
comment on table public.area_sessoes is
  'Sessão de um contato na área do cliente (cookie HttpOnly). O token só existe em hash. Revogar = revoked_at.';
comment on table public.area_codigos is
  'Código de 6 números mandado por e-mail para entrar na área do cliente. Só em hash; 5 tentativas; 10 minutos.';
comment on table public.area_eventos is
  'O rastro da área do cliente, para medir o funil: convite_criado → entrou → visitou → servico_visto → checkout_clicado → (compra no ledger). desejo = o que a pessoa disse querer.';

notify pgrst, 'reload schema';
