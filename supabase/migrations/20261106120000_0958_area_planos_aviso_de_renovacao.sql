-- 0958 — O AVISO ANTES DA RENOVAÇÃO do Plano da Semana.
--
-- A renovação sozinha no cartão (0954) cobrava sem avisar antes. Nada pode ser cobrado no cartão guardado sem a
-- pessoa saber: a rodada `/api/v1/cron/area-planos` manda um e-mail 48 h antes do vencimento (valor, dia e como
-- cancelar) e só cobra a semana cujo aviso saiu há 24 h ou mais (`lib/area-do-cliente/plano-semanal-renovacao.ts`).
--
-- `area_planos` ganha:
--   aviso_para — o `valido_ate` da semana anunciada (o aviso vale para UMA renovação; a seguinte pede outro)
--   aviso_em   — quando o aviso saiu
--
-- Aditiva e idempotente; `lock_timeout` de 5 s.

set lock_timeout = '5s';

alter table public.area_planos add column if not exists aviso_para timestamptz;
alter table public.area_planos add column if not exists aviso_em timestamptz;

comment on column public.area_planos.aviso_para is
  'O vencimento (valido_ate) cuja renovação foi avisada por e-mail (0958). Sem aviso para a semana, a renovação não cobra.';
