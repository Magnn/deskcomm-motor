-- 0934 — ÁREA DO CLIENTE: as etapas do trabalho, e quem já fez cada uma.
--
-- Por que existe: o trabalho comprado (7 noites de vela, 3 etapas de um ritual)
-- vivia só no texto da conversa e nas anotações da agente. Quem abria a área via
-- "compra confirmada" e mais nada: não sabia em que noite estava nem o que vinha
-- depois. Agora a empresa escreve as etapas no serviço (CRM › Área do cliente ›
-- Serviços) e a pessoa marca, na área, cada etapa que fez.
--
--   • area_servicos.etapas — a lista de etapas do serviço, escrita pela equipe
--     (manager+, pela policy que a vitrine já tem): [{titulo, orientacao?}], até 20.
--   • area_etapas_feitas  — uma linha por etapa marcada pela pessoa. Só o
--     servidor escreve (rota pública da área, com a sessão do cookie); a equipe
--     LÊ pela RLS, para ver em que ponto cada cliente está.
--   • area_eventos.tipo   — ganha 'etapa_feita', para o painel contar.
--
-- Aditiva e idempotente. O CHECK dos eventos só ACRESCENTA um valor: nenhuma
-- linha existente deixa de passar, então não há dado a corrigir antes.

alter table public.area_servicos add column if not exists etapas jsonb not null default '[]'::jsonb;
alter table public.area_servicos drop constraint if exists area_servicos_etapas_forma;
alter table public.area_servicos add constraint area_servicos_etapas_forma
  check (jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) <= 20);

comment on column public.area_servicos.etapas is
  'As etapas do trabalho, na ordem: [{"titulo": "1ª noite", "orientacao": "vela branca às 21h"}], até 20. Vazio = o serviço não tem etapas.';

create table if not exists public.area_etapas_feitas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  servico_id uuid not null references public.area_servicos(id) on delete cascade,
  indice integer not null check (indice between 0 and 19),
  feita_em timestamptz not null default now(),
  unique (organization_id, contact_id, servico_id, indice)
);
create index if not exists area_etapas_feitas_contato_idx
  on public.area_etapas_feitas (organization_id, contact_id, servico_id);

alter table public.area_etapas_feitas enable row level security;
drop policy if exists tenant_isolation_area_etapas_feitas_select on public.area_etapas_feitas;
create policy tenant_isolation_area_etapas_feitas_select on public.area_etapas_feitas
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_etapas_feitas from anon;

comment on table public.area_etapas_feitas is
  'Etapas do trabalho que a pessoa marcou como feitas na área do cliente (índice na lista area_servicos.etapas). Só o servidor escreve; a equipe lê pela RLS.';

alter table public.area_eventos drop constraint if exists area_eventos_tipo_check;
alter table public.area_eventos add constraint area_eventos_tipo_check check (tipo in (
  'convite_criado', 'entrou', 'visitou', 'material_aberto',
  'servico_visto', 'checkout_clicado', 'desejo', 'email_salvo', 'saiu',
  'carta_do_dia', 'diario_escrito', 'aniversario_salvo',
  'circulo_checkout', 'circulo_ativado', 'pergunta_enviada',
  'presente_checkout', 'presente_pago', 'presente_usado',
  'ano_pessoal_checkout', 'ano_pessoal_pago',
  'etapa_feita'
));

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
