-- 0917 · Cobrança do canal oficial, por mensagem.
--
-- ─── O que é ────────────────────────────────────────────────────────────────
-- A cada confirmação de envio/entrega, o canal oficial informa se AQUELA
-- mensagem foi cobrada, em que categoria e por qual regra saiu grátis. O
-- webhook jogava isso fora: quem recebia a fatura não tinha onde ver qual
-- mensagem a gerou. Três colunas na própria mensagem guardam o que o provedor
-- disse, sem interpretar.
--
-- ─── Por que coluna, e não `metadata` ───────────────────────────────────────
-- A pergunta que isto responde é agregada ("quantas cobradas, por categoria,
-- por dia") e a escrita vem de um `update` do webhook, que trocaria o jsonb
-- inteiro. Coluna é consultável e não disputa `metadata` com o envio.
--
-- ─── Por que sem CHECK ──────────────────────────────────────────────────────
-- O vocabulário é do provedor e ele já o mudou (cobrança por conversa → por
-- mensagem). CHECK aqui faria a confirmação de entrega falhar no dia em que
-- uma categoria nova aparecesse.
--
-- ─── O que NÃO guarda ───────────────────────────────────────────────────────
-- Valor em dinheiro: o provedor não o informa por mensagem.

alter table public.messages add column if not exists billing_billable boolean;
alter table public.messages add column if not exists billing_category text;
alter table public.messages add column if not exists billing_type text;

comment on column public.messages.billing_billable is
  'Canal oficial: o provedor informou que ESTA mensagem foi cobrada (true) ou saiu gratuita (false). Nulo = o provedor não informou.';
comment on column public.messages.billing_category is
  'Canal oficial: categoria de cobrança informada pelo provedor (marketing, utility, authentication, service…). Vocabulário aberto, sem CHECK.';
comment on column public.messages.billing_type is
  'Canal oficial: por que a mensagem foi cobrada ou gratuita, como o provedor informa (regular, free_customer_service, free_entry_point…). Vocabulário aberto, sem CHECK.';

create index if not exists messages_cobradas_por_org_idx
  on public.messages (organization_id, sent_at desc)
  where billing_billable is true;
