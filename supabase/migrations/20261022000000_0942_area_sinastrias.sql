-- 0942 — A SINASTRIA VENDIDA DIRETO NA PÁGINA (o quiz "Vocês combinam?").
--
-- Pedido do dono em 21/10/2026: vender para o público frio sem passar pelo WhatsApp. A pessoa responde o quiz,
-- vê o começo do resultado (os signos e o elemento de cada um, calculados pela data), paga pela Stripe e recebe a
-- leitura completa na área do cliente, escrita pela IA na hora.
--
-- `area_sinastrias`: o pedido. Nasce antes do pagamento (o id vai nos metadados da cobrança), o aviso da Stripe
-- marca `pago_at`, e a geração grava `texto`. Só o servidor escreve; a equipe lê.
--
-- `area_sessoes.origem` ganha `quiz` (quem entrou pelo quiz não tem convite nem código).
-- `area_eventos.tipo` ganha `sinastria_checkout` e `sinastria_paga` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_sinastrias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  nome_dela text not null check (char_length(nome_dela) between 1 and 80),
  nascimento_dela date not null,
  nome_dele text not null check (char_length(nome_dele) between 1 and 80),
  nascimento_dele date not null,
  respostas jsonb not null default '{}'::jsonb,
  -- O acesso ao resultado: o hash do segredo devolvido só a quem fez o pedido (não abre a área de ninguém).
  segredo_hash text not null check (char_length(segredo_hash) = 64),
  preco_cents integer not null check (preco_cents between 100 and 100000),
  pagamento text,
  pago_at timestamptz,
  texto text check (texto is null or char_length(texto) <= 16000),
  modelo text,
  created_at timestamptz not null default now()
);
create index if not exists area_sinastrias_pessoa_idx on public.area_sinastrias (organization_id, contact_id, created_at desc);

comment on table public.area_sinastrias is
  'A sinastria vendida pelo quiz da página (migration 0942): nasce antes do pagamento, o aviso da Stripe marca pago_at, a IA escreve o texto. A equipe lê; só o servidor escreve.';

alter table public.area_sinastrias enable row level security;
drop policy if exists tenant_isolation_area_sinastrias_select on public.area_sinastrias;
create policy tenant_isolation_area_sinastrias_select on public.area_sinastrias
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_sinastrias from anon;
revoke insert, update, delete, truncate on public.area_sinastrias from authenticated;

alter table public.area_sessoes drop constraint if exists area_sessoes_origem_check;
alter table public.area_sessoes add constraint area_sessoes_origem_check check (origem in ('convite', 'codigo', 'quiz'));

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
  'contribuicao_checkout', 'contribuicao_paga',
  'sinastria_checkout', 'sinastria_paga'
));
