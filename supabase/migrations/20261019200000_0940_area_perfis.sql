-- 0940 — O PERFIL DA ÁREA DO CLIENTE (a entrada com 3 perguntas).
--
-- Pedido do dono em 19/10/2026: na primeira vez que a pessoa entra na área, três perguntas curtas — o que mais
-- pede cuidado na vida dela agora (o foco), o que está pesando (em uma frase) e a data de nascimento — e a área
-- já abre "feita para ela": o céu do nascimento (Sol e Lua) e perguntas para a Mesa no tema dela.
--
-- `area_perfis`: uma linha por pessoa. A linha existir = a entrada foi feita (ou pulada): não pergunta de novo.
-- O foco e a frase são dela; só o servidor lê e escreve. A data de nascimento continua em `contacts.birthdate`.
--
-- `area_eventos.tipo` ganha `perfil_salvo` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_perfis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  foco text check (foco is null or foco in ('amor', 'dinheiro', 'familia', 'saude', 'caminhos', 'autoconhecimento')),
  o_que_pesa text check (o_que_pesa is null or char_length(o_que_pesa) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint area_perfis_pessoa_unica unique (organization_id, contact_id)
);

comment on table public.area_perfis is
  'A entrada com 3 perguntas da área do cliente (migration 0940): o foco e o que pesa, de cada pessoa. A linha existir = a entrada foi feita ou pulada. Só o servidor lê e escreve.';

alter table public.area_perfis enable row level security;
revoke all on public.area_perfis from anon, authenticated;

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
  'perfil_salvo'
));
