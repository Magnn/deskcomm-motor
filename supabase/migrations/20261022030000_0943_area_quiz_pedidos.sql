-- 0943 — OS QUIZZES DE UMA PESSOA SÓ: "Seu número da prosperidade" e "O que abre os seus caminhos?".
--
-- Pedido do dono em 22/10/2026: além da sinastria (0942, dois nascimentos), dois quizzes de uma pessoa, vendidos
-- direto na página do mesmo jeito: a prévia calculada, o pagamento pela Stripe e a leitura escrita pela IA.
--
-- `area_quiz_pedidos`: o pedido, com o `tipo` do quiz. Nasce antes do pagamento (o id vai nos metadados da
-- cobrança), o aviso da Stripe marca `pago_at`, a geração grava `texto`. O resultado abre pelo segredo do pedido
-- (o banco guarda o hash). Só o servidor escreve; a equipe lê.
--
-- `area_eventos.tipo` ganha `quiz_checkout` e `quiz_pago` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_quiz_pedidos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tipo text not null check (tipo in ('prosperidade', 'caminhos')),
  nome text not null check (char_length(nome) between 1 and 80),
  nascimento date,
  respostas jsonb not null default '{}'::jsonb,
  segredo_hash text not null check (char_length(segredo_hash) = 64),
  preco_cents integer not null check (preco_cents between 100 and 100000),
  pagamento text,
  pago_at timestamptz,
  texto text check (texto is null or char_length(texto) <= 16000),
  modelo text,
  created_at timestamptz not null default now()
);
create index if not exists area_quiz_pedidos_pessoa_idx on public.area_quiz_pedidos (organization_id, contact_id, created_at desc);

comment on table public.area_quiz_pedidos is
  'Os quizzes de uma pessoa vendidos na página (migration 0943): prosperidade (numerologia) e caminhos (ritual guiado). Nasce antes do pagamento, o aviso da Stripe marca pago_at, a IA escreve o texto. A equipe lê; só o servidor escreve.';

alter table public.area_quiz_pedidos enable row level security;
drop policy if exists tenant_isolation_area_quiz_pedidos_select on public.area_quiz_pedidos;
create policy tenant_isolation_area_quiz_pedidos_select on public.area_quiz_pedidos
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_quiz_pedidos from anon;
revoke insert, update, delete, truncate on public.area_quiz_pedidos from authenticated;

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
  'sinastria_checkout', 'sinastria_paga',
  'quiz_checkout', 'quiz_pago'
));
