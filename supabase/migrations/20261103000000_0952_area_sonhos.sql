-- 0952 — A INTERPRETAÇÃO DE SONHOS na área do cliente.
--
-- Pedido dos comentários das lojas (02/11/2026): "queria um lugar para contar meus sonhos e entender o que
-- significam". Mesmo molde da leitura da mão (0951): a pessoa escreve o sonho, a IA lê os símbolos, o primeiro
-- símbolo sai de graça na hora e o resto (os outros símbolos, a mensagem e o passo) abre com créditos, Pix ou
-- cartão. Mostrar antes de cobrar.
--
-- `area_sonhos`: uma linha por sonho contado, com o relato (até 1.500 caracteres) e a leitura (jsonb). Só o
-- servidor lê e escreve: é o sonho de uma pessoa.
--
-- `area_eventos.tipo` ganha `sonho_lido`, `sonho_checkout` e `sonho_pago` (o CHECK só acrescenta).
--
-- Aditiva e idempotente. Tabela nova e vazia; o `lock_timeout` segura a troca do CHECK de `area_eventos`.

set lock_timeout = '5s';

create table if not exists public.area_sonhos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  relato text not null check (char_length(relato) between 20 and 1500),
  leitura jsonb not null,
  modelo text,
  preco_cents integer not null check (preco_cents between 100 and 100000),
  pagamento text,
  pago_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_sonhos_contato_idx
  on public.area_sonhos (organization_id, contact_id, created_at desc);

comment on table public.area_sonhos is
  'Interpretações de sonho na área do cliente (migration 0952). Nasce com a leitura escrita pela IA e pago_at nulo (só o primeiro símbolo aparece); créditos ou o aviso da Stripe marcam pago_at. Só o servidor lê e escreve.';

alter table public.area_sonhos enable row level security;
revoke all on public.area_sonhos from anon, authenticated;

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
  'sonho_lido', 'sonho_checkout', 'sonho_pago'
));
