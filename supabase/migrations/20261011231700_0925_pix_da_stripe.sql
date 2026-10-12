-- 0925 · A conexão de cobrança e o ledger de receita aceitam a Stripe.
--
-- O QUÊ:
--   1. `payment_gateway_connections.provider` aceita 'stripe' (além de 'asaas').
--   2. `payment_gateway_connections.webhook_secret_encrypted`: o segredo que confere a assinatura do aviso de
--      pagamento da Stripe. Cifrado como a chave de API; nunca volta para a tela.
--   3. `revenue_ledger.provider` aceita 'stripe' (além de 'cakto' e 'manual').
--
-- POR QUÊ: o Pix "copia e cola" gerado dentro da conversa, no valor que a negociação liberou, é cobrado pela
-- Stripe e confirmado por aviso assinado. Sem (1) e (2) não há onde guardar a conexão; sem (3) o pagamento
-- confirmado não entra no Dashboard nem na aba Receita, que somam o ledger.
--
-- Idempotente: `add column if not exists`; os CHECKs são derrubados e recriados. Todo valor existente continua
-- aceito, então não há dado a corrigir antes.

alter table public.payment_gateway_connections
  add column if not exists webhook_secret_encrypted text;

alter table public.payment_gateway_connections
  drop constraint if exists payment_gateway_connections_provider_conhecido;
alter table public.payment_gateway_connections
  add constraint payment_gateway_connections_provider_conhecido check (provider in ('asaas', 'stripe'));

alter table public.revenue_ledger
  drop constraint if exists revenue_ledger_provider_check;
alter table public.revenue_ledger
  add constraint revenue_ledger_provider_check check (provider in ('cakto', 'manual', 'stripe'));

comment on column public.payment_gateway_connections.webhook_secret_encrypted
  is 'Segredo da assinatura do aviso de pagamento do provedor (Stripe), cifrado. Nunca é devolvido à tela.';
comment on column public.revenue_ledger.provider
  is 'De onde veio o fato de dinheiro: ''cakto'' (aviso do checkout), ''manual'' (registrado pela equipe) ou ''stripe'' (Pix gerado na conversa).';
