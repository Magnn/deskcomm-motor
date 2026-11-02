-- 0951 — A LEITURA DA MÃO pela foto, na área do cliente.
--
-- Pedido do dono em 02/11/2026 ("queremos de alto nível"), modelado no MagicWay: a pessoa fotografa a palma,
-- a IA de visão lê as cinco linhas, a do coração sai de graça na hora e o resto abre com créditos, Pix ou
-- cartão. A FOTO NÃO É GUARDADA — só o texto da leitura.
--
-- `area_maos`: uma linha por foto lida. Nasce já com a `leitura` (jsonb: linhas, síntese, passo) e `pago_at`
-- nulo; o débito de créditos ou o aviso de pagamento da Stripe marca `pago_at`. Só o servidor lê e escreve:
-- é a leitura pessoal de quem comprou.
--
-- `area_eventos.tipo` ganha `mao_lida`, `mao_checkout` e `mao_paga` (o CHECK só acrescenta).
--
-- Aditiva e idempotente. Tabela nova e vazia: o lock é instantâneo; o `lock_timeout` segura a troca do CHECK
-- de `area_eventos` para não enfileirar o atendimento atrás dela.

set lock_timeout = '5s';

create table if not exists public.area_maos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  leitura jsonb not null,
  modelo text,
  preco_cents integer not null check (preco_cents between 100 and 100000),
  pagamento text,
  pago_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_maos_contato_idx
  on public.area_maos (organization_id, contact_id, created_at desc);

comment on table public.area_maos is
  'Leituras da mão pela foto na área do cliente (migration 0951). Nasce com a leitura escrita pela IA e pago_at nulo (só a linha do coração aparece); créditos ou o aviso da Stripe marcam pago_at. A foto não é guardada. Só o servidor lê e escreve.';

alter table public.area_maos enable row level security;
revoke all on public.area_maos from anon, authenticated;

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
  'quiz_checkout', 'quiz_pago',
  'mao_lida', 'mao_checkout', 'mao_paga'
));
