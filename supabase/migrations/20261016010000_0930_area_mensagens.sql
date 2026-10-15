-- 0930 — ÁREA DO CLIENTE: "Fale com a gente" dentro da própria área.
--
-- Por que existe: em 15/10/2026 o número oficial de WhatsApp foi banido e o
-- botão "Falar com a gente" da área ficou sem número. Para quem pagou e tem
-- medo de golpe, abrir a área e não ter como falar com ninguém confirma o medo.
-- A conversa passa a acontecer na área: o cliente escreve, a equipe responde em
-- CRM › Área do cliente › Mensagens, e a resposta aparece na área dele.
--
-- Escrita só pelo servidor (rotas da área e da equipe); a equipe LÊ pela RLS.
-- Aditiva e idempotente.

create table if not exists public.area_mensagens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  autor text not null check (autor in ('cliente', 'equipe')),
  autor_user_id uuid references auth.users(id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 2000),
  lida_pela_equipe_at timestamptz,
  lida_pelo_cliente_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_mensagens_contato_idx on public.area_mensagens (organization_id, contact_id, created_at);
create index if not exists area_mensagens_pendentes_idx on public.area_mensagens (organization_id, created_at desc)
  where autor = 'cliente' and lida_pela_equipe_at is null;

alter table public.area_mensagens enable row level security;
drop policy if exists tenant_isolation_area_mensagens_select on public.area_mensagens;
create policy tenant_isolation_area_mensagens_select on public.area_mensagens
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_mensagens from anon;

comment on table public.area_mensagens is
  'Conversa da área do cliente: o cliente escreve na área, a equipe responde no painel. Só o servidor escreve; a equipe lê pela RLS.';

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
