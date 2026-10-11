-- 0924 · O ledger de receita aceita o pagamento registrado pela equipe.
--
-- O QUÊ: `revenue_ledger.provider` passa a aceitar 'manual', além de 'cakto'.
--
-- POR QUÊ: o botão "Registrar pagamento" da conversa (pagamento que entrou por fora do
-- checkout — um Pix direto na chave da empresa, dinheiro) marcava o contato como pago,
-- fechava o negócio e reportava a venda, mas não tinha como gravar o fato de dinheiro: o
-- CHECK da 0416 só aceitava 'cakto'. Medido em produção em 11/10/2026: uma venda de R$ 130
-- registrada pela equipe ficou fora do Dashboard e da aba Receita, que somam este ledger.
--
-- A linha manual usa `external_event_id = 'manual-<chave do registro>'` (a chave de dedupe
-- continua valendo: o mesmo registro enviado duas vezes não vira duas receitas) e
-- `created_by_user_id` com quem registrou. `webhook_source_id` fica nulo — não veio de aviso.
--
-- Idempotente: derruba e recria o CHECK. Não há dado a corrigir antes: 'manual' é valor novo
-- e todo valor existente ('cakto') continua aceito.

alter table public.revenue_ledger
  drop constraint if exists revenue_ledger_provider_check;

alter table public.revenue_ledger
  add constraint revenue_ledger_provider_check check (provider in ('cakto', 'manual'));

comment on column public.revenue_ledger.provider
  is 'De onde veio o fato de dinheiro: ''cakto'' (aviso do checkout) ou ''manual'' (registrado pela equipe na conversa).';
