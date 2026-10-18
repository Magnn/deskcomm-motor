-- 0936 — franquia de conversas do plano e o excedente informado à Stripe.
--
-- O plano inclui N conversas atendidas pela IA por ciclo (`PLANS_CATALOG`); o que passar disso é cobrado
-- por conversa na fatura da assinatura (`STRIPE_PLANS_EXCEDENTE_CENTAVOS`). O cron `excedente-de-conversas`
-- conta as conversas do ciclo e informa à Stripe só a diferença desde o último informe — e para isso precisa
-- lembrar o que já informou, e em que ciclo. Informar o total de novo dobraria a cobrança.
--
--   conversas_no_ciclo     — a última contagem (a tela de planos mostra "312 de 300").
--   excedente_ciclo_inicio — o ciclo da assinatura a que a contagem e o informado se referem.
--   excedente_ciclo_fim
--   excedente_informado    — conversas além da franquia já informadas à Stripe NESTE ciclo.
--   excedente_medido_em    — quando a contagem foi feita.
--
-- Colunas sem default de dado: linha antiga fica nula ("ainda não medido"), e o informado nasce 0.
alter table public.organization_subscriptions
  add column if not exists conversas_no_ciclo integer,
  add column if not exists excedente_ciclo_inicio timestamptz,
  add column if not exists excedente_ciclo_fim timestamptz,
  add column if not exists excedente_informado integer not null default 0,
  add column if not exists excedente_medido_em timestamptz;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_excedente_nao_negativo;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_excedente_nao_negativo
  check (excedente_informado >= 0 and (conversas_no_ciclo is null or conversas_no_ciclo >= 0));
