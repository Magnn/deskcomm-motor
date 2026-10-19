-- 0941 — AS SIMPATIAS DA ÁREA DO CLIENTE e a CONTRIBUIÇÃO voluntária.
--
-- Pedido do dono em 19/10/2026: a assinatura (o Círculo) dá acesso às simpatias, e em cada uma a pessoa escolhe
-- fazer em casa (o passo a passo) ou pagar para o templo fazer por ela. Separado disso, uma contribuição livre.
--
-- `area_simpatias`: o catálogo, cadastrado pela equipe (manager+ escreve, a equipe lê — como a vitrine).
-- `area_simpatias_pedidos`: o serviço "o templo faz por mim". Nasce antes do pagamento (o id vai nos metadados da
-- cobrança), o aviso da Stripe marca `pago_at`, a equipe marca `feita_at` com um recado. Só o servidor escreve.
-- A contribuição não tem tabela: é receita no ledger e um evento.
--
-- `area_eventos.tipo` ganha `simpatia_checkout`, `simpatia_paga`, `simpatia_feita`, `contribuicao_checkout` e
-- `contribuicao_paga` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_simpatias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 80),
  intencao text not null check (char_length(intencao) between 1 and 200),
  materiais text check (materiais is null or char_length(materiais) <= 600),
  passos text not null check (char_length(passos) between 1 and 4000),
  cuidado text check (cuidado is null or char_length(cuidado) <= 400),
  publicada boolean not null default true,
  posicao numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists area_simpatias_org_idx on public.area_simpatias (organization_id, posicao);

comment on table public.area_simpatias is
  'As simpatias da área do cliente (migration 0941): o passo a passo de cada uma, cadastrado pela equipe. A equipe lê; manager+ escreve.';

create table if not exists public.area_simpatias_pedidos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  simpatia_id uuid references public.area_simpatias(id) on delete set null,
  titulo text not null check (char_length(titulo) between 1 and 80),
  para_quem text check (para_quem is null or char_length(para_quem) <= 200),
  valor_cents integer not null check (valor_cents > 0),
  pagamento text,
  pago_at timestamptz,
  feita_at timestamptz,
  feita_por_user_id uuid references auth.users(id) on delete set null,
  nota text check (nota is null or char_length(nota) <= 500),
  created_at timestamptz not null default now(),
  constraint area_simpatias_pedidos_feita_depois_de_paga check (feita_at is null or pago_at is not null)
);
create index if not exists area_simpatias_pedidos_fila_idx on public.area_simpatias_pedidos (organization_id, pago_at)
  where pago_at is not null and feita_at is null;
create index if not exists area_simpatias_pedidos_pessoa_idx on public.area_simpatias_pedidos (organization_id, contact_id, created_at desc);

comment on table public.area_simpatias_pedidos is
  'O serviço "o templo faz a simpatia por mim" (migration 0941): nasce antes do pagamento, o aviso da Stripe marca pago_at, a equipe marca feita_at com um recado. O título é guardado no pedido para a simpatia poder ser apagada sem perder o histórico. A equipe lê; só o servidor escreve.';

alter table public.area_simpatias enable row level security;
drop policy if exists tenant_isolation_area_simpatias_all on public.area_simpatias;
create policy tenant_isolation_area_simpatias_all on public.area_simpatias
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.area_simpatias from anon;

alter table public.area_simpatias_pedidos enable row level security;
drop policy if exists tenant_isolation_area_simpatias_pedidos_select on public.area_simpatias_pedidos;
create policy tenant_isolation_area_simpatias_pedidos_select on public.area_simpatias_pedidos
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_simpatias_pedidos from anon;
revoke insert, update, delete, truncate on public.area_simpatias_pedidos from authenticated;

alter table public.area_eventos drop constraint if exists area_eventos_tipo_check;
alter table public.area_eventos add constraint area_eventos_tipo_check check (tipo in (
  'convite_criado', 'entrou', 'visitou', 'material_aberto',
  'servico_visto', 'checkout_clicado', 'desejo', 'email_salvo', 'saiu',
  'carta_do_dia', 'diario_escrito', 'aniversario_salvo',
  'circulo_checkout', 'circulo_ativado', 'pergunta_enviada',
  'presente_checkout', 'presente_pago', 'presente_usado',
  'ano_pessoal_checkout', 'ano_pessoal_pago',
  'etapa_feita',
  'leitura_checkout', 'leitura_paga', 'leitura_revelada',
  'creditos_checkout', 'creditos_pagos',
  'aviso_ligado', 'aviso_desligado',
  'perfil_salvo',
  'simpatia_checkout', 'simpatia_paga', 'simpatia_feita',
  'contribuicao_checkout', 'contribuicao_paga'
));
