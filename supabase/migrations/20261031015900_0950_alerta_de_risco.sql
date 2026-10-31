-- O ALERTA DE RISCO DE VIDA FORA DA TELA.
--
-- A passagem por risco de vida ficava só na Central, e medido em 31/10/2026 nenhuma
-- das conversas dos 7 dias anteriores tinha recebido resposta. O cron
-- `alerta-de-risco` avisa por e-mail e WhatsApp da equipe, até três vezes; estas
-- colunas seguram o teto e a espera, como `cobrancas` faz para a Central.
alter table public.passagens_de_atendimento add column if not exists alertas_de_risco smallint not null default 0;
alter table public.passagens_de_atendimento add column if not exists ultimo_alerta_de_risco_em timestamptz;
comment on column public.passagens_de_atendimento.alertas_de_risco is
  'Quantos alertas de risco de vida saíram para fora da tela (e-mail/WhatsApp da equipe). Teto em lib/escalacao/alerta-de-risco.ts.';
