-- 0953 — O PLANO DA SEMANA da área do cliente.
--
-- Pedido do dono em 03/11/2026: um plano de entrada de R$ 5 / US$ 1 / € 1 por semana, ao lado do Círculo (R$ 29
-- por mês). Cada pagamento estende o acesso em 7 dias a partir do maior entre agora e o vencimento atual — no
-- Brasil, Pix ou cartão por período; fora, cartão em dólar ou euro.
--
-- `area_planos`: uma linha por pessoa e plano (por ora só `semanal`). `ultimo_pagamento` segura a reentrega do
-- aviso da Stripe (o mesmo pagamento não estende duas vezes); `moeda` é a do último pagamento; `stripe_assinatura`
-- e `cancelada_em` ficam para a renovação automática no cartão. Só o servidor lê e escreve.
--
-- `area_eventos.tipo` ganha `plano_checkout` e `plano_ativado` (o CHECK só acrescenta).
--
-- Aditiva e idempotente. Tabela nova e vazia; o `lock_timeout` segura a troca do CHECK de `area_eventos`.

set lock_timeout = '5s';

create table if not exists public.area_planos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  plano text not null check (plano in ('semanal')),
  valido_ate timestamptz not null,
  ultimo_pagamento text,
  moeda text not null default 'BRL' check (moeda in ('BRL', 'USD', 'EUR')),
  stripe_assinatura text,
  cancelada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id, plano)
);

comment on table public.area_planos is
  'Planos de acesso por período da área do cliente (migration 0953; hoje só o semanal). Cada pagamento estende valido_ate em 7 dias; ultimo_pagamento segura a reentrega do aviso. Só o servidor lê e escreve.';

alter table public.area_planos enable row level security;
revoke all on public.area_planos from anon, authenticated;

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
  'mao_lida', 'mao_checkout', 'mao_paga',
  'sonho_lido', 'sonho_checkout', 'sonho_pago',
  'plano_checkout', 'plano_ativado'
));
