-- 0956 — A SUA MANHÃ: a carta do dia mais funda e o horóscopo DELA, para quem tem o Plano da Semana ou o Círculo.
--
-- Pedido do dono em 03/11/2026: "carta do dia com mais profundidade pra gerar desejo e curiosidade" e "horóscopo do
-- dia específico com a energia dela". Uma chamada de IA por pessoa por dia (`lib/area-do-cliente/manha-ia.ts`),
-- guardada aqui: voltar à tarde mostra o mesmo texto e não paga outra chamada. `dia` é a data no fuso da empresa.
-- Só o servidor lê e escreve.
--
-- Aditiva e idempotente; `lock_timeout` de 5 s.

set lock_timeout = '5s';

create table if not exists public.area_manhas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  dia date not null,
  texto jsonb not null,
  modelo text,
  created_at timestamptz not null default now(),
  unique (organization_id, contact_id, dia)
);

comment on table public.area_manhas is
  'A manhã da cliente da área (migration 0956): a carta do dia lida para ela, a energia do dia pelo céu dela e um gesto. Uma por pessoa por dia, escrita pela IA para quem tem o Plano da Semana ou o Círculo. Só o servidor lê e escreve.';

alter table public.area_manhas enable row level security;
revoke all on public.area_manhas from anon, authenticated;
