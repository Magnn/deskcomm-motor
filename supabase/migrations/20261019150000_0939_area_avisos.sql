-- 0939 — OS AVISOS DA ÁREA DO CLIENTE (notificação no celular).
--
-- Pedido do dono em 19/10/2026: a área vira um app no celular (ícone na tela de início) e a pessoa que
-- quiser recebe UM aviso por dia — "a sua carta de hoje abriu" — na hora que a empresa escolher. É o motivo
-- diário de voltar, sem depender do WhatsApp.
--
-- `area_avisos`: uma linha por aparelho inscrito (a inscrição de push do navegador: endpoint + chaves).
-- `ultimo_aviso_dia` é o dia (no fuso da empresa) do último aviso mandado: no máximo um por dia. Só o
-- servidor lê e escreve — o endpoint é um endereço de entrega do aparelho da pessoa.
--
-- `area_eventos.tipo` ganha `aviso_ligado` e `aviso_desligado` (o CHECK só acrescenta). Quem abre a área
-- pelo aviso entra como `visitou` com `ref = 'aviso'`.
--
-- Aditiva e idempotente.

create table if not exists public.area_avisos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  ultimo_aviso_dia date,
  created_at timestamptz not null default now(),
  constraint area_avisos_endpoint_unico unique (organization_id, endpoint)
);
create index if not exists area_avisos_contato_idx on public.area_avisos (organization_id, contact_id);

comment on table public.area_avisos is
  'Aparelhos inscritos no aviso diário da área do cliente (migration 0939): inscrição de push do navegador. No máximo um aviso por dia (ultimo_aviso_dia, no fuso da empresa). Só o servidor lê e escreve.';

alter table public.area_avisos enable row level security;
revoke all on public.area_avisos from anon, authenticated;

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
  'aviso_ligado', 'aviso_desligado'
));
