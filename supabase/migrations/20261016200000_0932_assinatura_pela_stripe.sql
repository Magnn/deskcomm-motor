-- 0932 · A assinatura do plano pode vir da Stripe.
--
-- O QUÊ: `organization_subscriptions.source` passa a aceitar 'stripe', além de 'cakto' e 'manual'.
--
-- POR QUÊ: a tela de planos vende a assinatura mensal pelo checkout da Stripe (conta do dono da
-- instalação). O aviso da Stripe grava o plano com a origem 'stripe' e o id da assinatura (`sub_…`) em
-- `reference` — é por eles que a troca de plano, o portal e a queda acham a assinatura certa. Medido em
-- produção em 16/10/2026: havia gente querendo comprar o plano sem caminho para pagar.
--
-- Idempotente: derruba e recria o CHECK. Não há dado a corrigir antes: 'stripe' é valor novo e todo
-- valor existente continua aceito.

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_source_conhecida;

alter table public.organization_subscriptions
  add constraint organization_subscriptions_source_conhecida check (source in ('cakto', 'manual', 'stripe'));
