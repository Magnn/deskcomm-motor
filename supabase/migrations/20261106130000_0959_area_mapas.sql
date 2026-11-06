-- 0959 — A LEITURA DO MAPA ASTRAL, a parte paga em cima do mapa grátis da área do cliente.
--
-- Pedido do dono em 05/11/2026 (o mapa astral pago, item 3 das formas de faturar): com o mapa calculado no servidor,
-- a IA escreve o Sol, a Lua, o Ascendente (com a hora), Vênus e Marte, uma síntese e um passo. O Sol sai de graça
-- na hora; o resto abre com créditos, Pix ou cartão (`lib/area-do-cliente/leitura-do-mapa.ts`).
--
-- `area_mapas`: uma linha por leitura pedida, com o nascimento usado (data, hora, id da cidade) e a leitura (jsonb).
-- Só o servidor lê e escreve: é a leitura pessoal de quem comprou.
--
-- `area_eventos.tipo` ganha `mapa_lido`, `mapa_checkout` e `mapa_pago` (o CHECK só acrescenta).
--
-- Aditiva e idempotente; `lock_timeout` de 5 s para a troca do CHECK de `area_eventos`.

set lock_timeout = '5s';

create table if not exists public.area_mapas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  nascimento jsonb not null,
  leitura jsonb not null,
  modelo text,
  preco_cents integer not null check (preco_cents between 100 and 1000000),
  pagamento text,
  pago_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_mapas_contato_idx
  on public.area_mapas (organization_id, contact_id, created_at desc);

comment on table public.area_mapas is
  'Leituras do mapa astral na área do cliente (migration 0959). Nasce com a leitura escrita pela IA e pago_at nulo (só o Sol aparece); créditos ou o aviso da Stripe marcam pago_at. Só o servidor lê e escreve.';

alter table public.area_mapas enable row level security;
revoke all on public.area_mapas from anon, authenticated;

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
  'plano_checkout', 'plano_ativado',
  'mapa_lido', 'mapa_checkout', 'mapa_pago'
));
