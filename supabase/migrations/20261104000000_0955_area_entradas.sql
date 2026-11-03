-- 0955 — A ENTRADA PELO PLANO DE 7 DIAS, vendida direto na página.
--
-- Pedido do dono em 03/11/2026: a porta do funil é o plano de 7 dias por R$ 5 / US$ 1 / € 1, comprado na página por
-- quem ainda não tem área, com 20 créditos de boas-vindas para usar dentro do app.
--
-- `area_entradas`: o pedido da entrada. Nasce antes do pagamento (o id vai nos metadados da cobrança, com o extra
-- `plano-semanal`), o aviso da Stripe marca `pago_at` e, no mesmo passo, estende o plano e credita as boas-vindas.
-- Quem pagou entra na área pelo segredo do pedido (o banco guarda o hash), como nos quizzes. Uma entrada paga por
-- pessoa: quem já teve plano ou entrada volta pela área, no preço da área. Só o servidor escreve; a equipe lê.
--
-- `area_creditos.motivo` ganha `boas_vindas` (o CHECK só acrescenta).
--
-- Aditiva e idempotente; `lock_timeout` de 5 s.

set lock_timeout = '5s';

create table if not exists public.area_entradas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  nascimento date,
  foco text not null check (foco in ('amor', 'dinheiro', 'caminhos', 'eu')),
  moeda text not null default 'BRL' check (moeda in ('BRL', 'USD', 'EUR')),
  segredo_hash text not null check (char_length(segredo_hash) = 64),
  pagamento text,
  pago_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_entradas_pessoa_idx on public.area_entradas (organization_id, contact_id, created_at desc);

comment on table public.area_entradas is
  'A entrada pelo plano de 7 dias vendida na página (migration 0955). Nasce antes do pagamento; o aviso da Stripe marca pago_at, estende o plano e credita as boas-vindas. Abre a área pelo segredo do pedido. A equipe lê; só o servidor escreve.';

alter table public.area_entradas enable row level security;
drop policy if exists tenant_isolation_area_entradas_select on public.area_entradas;
create policy tenant_isolation_area_entradas_select on public.area_entradas
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_entradas from anon;
revoke insert, update, delete, truncate on public.area_entradas from authenticated;

alter table public.area_creditos drop constraint if exists area_creditos_motivo_check;
alter table public.area_creditos add constraint area_creditos_motivo_check
  check (motivo in ('pacote', 'circulo', 'leitura', 'devolucao', 'ajuste', 'boas_vindas'));
