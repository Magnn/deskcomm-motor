-- 0937 — A MESA DE LEITURAS da área do cliente.
--
-- Pedido do dono em 18/10/2026: quem está na área escolhe uma modalidade (Tarot, Baralho Cigano…), faz a
-- pergunta, paga ali mesmo (R$ 5 a primeira de cada modalidade) e vê a leitura na hora: embaralha, escolhe
-- três cartas e a leitura aparece no chat. A leitura é AUTOMÁTICA (escrita pela IA nos métodos da casa) e a
-- tela diz isso.
--
-- `area_leituras`: uma linha por leitura. Nasce ao pedir o pagamento (`pago_at` nulo); o aviso de pagamento
-- da Stripe marca `pago_at`; ao revelar, o SERVIDOR sorteia as cartas (`cartas`) e a IA escreve o `texto`.
-- Só o servidor lê e escreve: a pergunta é da pessoa.
--
-- `area_eventos.tipo` ganha `leitura_checkout`, `leitura_paga` e `leitura_revelada` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_leituras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  modalidade text not null check (modalidade in ('tarot', 'baralho-cigano')),
  pergunta text not null check (char_length(pergunta) between 3 and 400),
  preco_cents integer not null check (preco_cents between 100 and 100000),
  pagamento text,
  pago_at timestamptz,
  cartas jsonb,
  texto text check (texto is null or char_length(texto) <= 12000),
  modelo text,
  revelada_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists area_leituras_contato_idx
  on public.area_leituras (organization_id, contact_id, created_at desc);

comment on table public.area_leituras is
  'Leituras compradas na Mesa da área do cliente (migration 0937). Nasce ao pedir o pagamento; o aviso da Stripe marca pago_at; ao revelar, o servidor sorteia as cartas e a IA escreve o texto. Só o servidor lê e escreve.';

alter table public.area_leituras enable row level security;
revoke all on public.area_leituras from anon, authenticated;

alter table public.area_eventos drop constraint if exists area_eventos_tipo_check;
alter table public.area_eventos add constraint area_eventos_tipo_check check (tipo in (
  'convite_criado', 'entrou', 'visitou', 'material_aberto',
  'servico_visto', 'checkout_clicado', 'desejo', 'email_salvo', 'saiu',
  'carta_do_dia', 'diario_escrito', 'aniversario_salvo',
  'circulo_checkout', 'circulo_ativado', 'pergunta_enviada',
  'presente_checkout', 'presente_pago', 'presente_usado',
  'ano_pessoal_checkout', 'ano_pessoal_pago',
  'etapa_feita',
  'leitura_checkout', 'leitura_paga', 'leitura_revelada'
));
