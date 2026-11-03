-- 0957 — POR QUEM EU PEÇO: a vela de 7 dias com uma intenção, na área do cliente.
--
-- Pedido do dono em 03/11/2026 ("oração… aquilo que você estudou nos depoimentos"): ela escreve por quem pede e o
-- quê, acende a vela, recebe uma oração escrita para aquele pedido (`lib/area-do-cliente/intencao-ia.ts`, ponto
-- `area_intencao`, uma chamada por vela) e, depois do sétimo dia, marca se a graça veio. Uma vela aberta por pessoa
-- (o índice parcial garante, mesmo com dois toques ao mesmo tempo). Só o servidor lê e escreve.
--
-- Aditiva e idempotente; `lock_timeout` de 5 s.

set lock_timeout = '5s';

create table if not exists public.area_velas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  por_quem text not null check (char_length(por_quem) between 1 and 60),
  pedido text not null check (char_length(pedido) between 5 and 400),
  oracao text not null,
  intencao text not null,
  dia_acesa date not null,
  modelo text,
  graca text check (graca in ('veio', 'ainda_nao')),
  graca_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_velas_pessoa_idx on public.area_velas (organization_id, contact_id, created_at desc);
create unique index if not exists area_velas_uma_aberta_idx on public.area_velas (organization_id, contact_id) where graca is null;

comment on table public.area_velas is
  'A vela de 7 dias com uma intenção (migration 0957): por quem ela pede, o pedido, a oração escrita pela IA e, depois do sétimo dia, se a graça veio. Uma aberta por pessoa. Só o servidor lê e escreve.';

alter table public.area_velas enable row level security;
revoke all on public.area_velas from anon, authenticated;
