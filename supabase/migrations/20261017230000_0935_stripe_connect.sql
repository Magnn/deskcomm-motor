-- 0935 · A conexão com a Stripe aceita a conta conectada (Stripe Connect).
--
-- O QUÊ:
--   1. `payment_gateway_connections.stripe_account_id`: a conta Stripe DA EMPRESA, criada pelo botão
--      "Conectar com Stripe" sob a plataforma desta instalação. Com ela, a chave usada é a da instalação, com o
--      cabeçalho `Stripe-Account` — a empresa não cola chave nenhuma.
--   2. `payment_gateway_connections.stripe_pronta`: a Stripe já liberou essa conta para receber
--      (`charges_enabled`). Lida de volta da Stripe quando a pessoa volta do cadastro e quando a tela abre.
--   3. `payment_gateway_connections.stripe_connect_webhook_secret_encrypted`: o segredo do aviso DA PLATAFORMA
--      para as contas conectadas — separado do `webhook_secret_encrypted` da chave colada, para a empresa que troca
--      um pelo outro não perder a confirmação das cobranças já emitidas.
--   4. Índice único parcial: uma conta conectada pertence a UMA linha — é por ela que o aviso de pagamento da
--      plataforma (`/api/v1/webhooks/stripe-connect`) acha a empresa.
--
-- POR QUÊ: a venda da empresa cliente cai na conta Stripe DELA (dinheiro no banco dela, reembolso e contestação
-- no saldo dela) e a instalação recebe a taxa da plataforma na própria cobrança. Passar a venda pela conta da
-- instalação seria guardar dinheiro de terceiro.
--
-- Aditiva e idempotente: colunas novas com default, índice `if not exists`. Nenhum dado existente muda; a
-- conexão por chave colada continua igual.

alter table public.payment_gateway_connections
  add column if not exists stripe_account_id text;

alter table public.payment_gateway_connections
  add column if not exists stripe_pronta boolean not null default false;
alter table public.payment_gateway_connections
  add column if not exists stripe_connect_webhook_secret_encrypted text;

create unique index if not exists payment_gateway_connections_stripe_account_uk
  on public.payment_gateway_connections (stripe_account_id)
  where stripe_account_id is not null;

comment on column public.payment_gateway_connections.stripe_account_id
  is 'Conta Stripe conectada (acct_…) da organização, criada pelo "Conectar com Stripe". Com ela, as cobranças usam a chave da instalação com o cabeçalho Stripe-Account.';
comment on column public.payment_gateway_connections.stripe_pronta
  is 'A Stripe liberou a conta conectada para receber (charges_enabled). Atualizado ao voltar do cadastro e ao abrir a tela.';
comment on column public.payment_gateway_connections.stripe_connect_webhook_secret_encrypted
  is 'Segredo (cifrado) do aviso DA PLATAFORMA para as contas conectadas (/api/v1/webhooks/stripe-connect) — o mesmo em toda linha conectada. Separado de webhook_secret_encrypted para a empresa que troca a chave colada pelo Connect não perder o aviso das cobranças já emitidas.';
