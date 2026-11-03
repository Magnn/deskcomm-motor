-- 0954 — A RENOVAÇÃO SOZINHA DO PLANO DA SEMANA no cartão.
--
-- Pedido do dono em 03/11/2026: o plano de R$ 5 / US$ 1 / € 1 por semana "renova sozinho no cartão". O primeiro
-- pagamento no cartão guarda o cartão na conta Stripe da empresa (`setup_future_usage=off_session`); a rodada de
-- hora em hora (`/api/v1/cron/area-planos`) cobra a semana seguinte quando faltam 12 horas para vencer, com os
-- mesmos metadados da área — o aviso `payment_intent.succeeded` de sempre estende o plano. Sem assinatura da
-- Stripe: nenhum evento novo, nenhum endereço de aviso a trocar nas empresas já conectadas.
--
-- `area_planos` ganha:
--   `stripe_cliente` / `stripe_cartao` — o cliente e o cartão guardados na conta da empresa;
--   `renova`            — ligado pelo pagamento no cartão; desligado pelo "Cancelar renovação" ou depois de 3 recusas;
--   `falhas`            — recusas seguidas do cartão (volta a zero a cada pagamento);
--   `proxima_tentativa` — a rodada não cobra antes disso (segura a cobrança em dobro e espaça a nova tentativa).
--
-- Aditiva e idempotente; colunas com padrão constante (sem reescrita da tabela).

set lock_timeout = '5s';

alter table public.area_planos add column if not exists stripe_cliente text;
alter table public.area_planos add column if not exists stripe_cartao text;
alter table public.area_planos add column if not exists renova boolean not null default false;
alter table public.area_planos add column if not exists falhas smallint not null default 0;
alter table public.area_planos add column if not exists proxima_tentativa timestamptz;

create index if not exists area_planos_renovacao_idx on public.area_planos (valido_ate) where renova;

comment on column public.area_planos.renova is
  'Renovação sozinha no cartão (0954): ligada pelo pagamento no cartão, desligada pelo cancelamento ou após 3 recusas.';
