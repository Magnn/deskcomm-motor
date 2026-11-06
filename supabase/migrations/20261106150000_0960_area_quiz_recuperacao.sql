-- 0960 — A RECUPERAÇÃO DE QUEM VIU A PRÉVIA DO QUIZ E NÃO PAGOU.
--
-- Medido em 06/11/2026 (teste em Portugal): quem dá o e-mail, vê a prévia e não paga vira contato (0944) e ninguém
-- volta a falar com ele — a lista ficava só no painel. A rodada `/api/v1/cron/area-quiz-recupera` manda dois e-mails
-- (1 h e ~24 h depois) com um link que REABRE a prévia já calculada (`lib/area-do-cliente/recuperacao-do-quiz.ts`).
--
-- `area_quiz_visitas` ganha:
--   dados             — nome, nascimento(s) e respostas dados no quiz, para a prévia reabrir sem refazer nada
--   recuperacao_chave — o segredo do link da retomada e do "não quero mais e-mails"
--   recuperacoes      — quantos e-mails de recuperação a visita já recebeu (até 2)
--   recuperacao_em    — quando saiu o último
--
-- Aditiva e idempotente; `lock_timeout` de 5 s.

set lock_timeout = '5s';

alter table public.area_quiz_visitas add column if not exists dados jsonb;
alter table public.area_quiz_visitas add column if not exists recuperacao_chave uuid not null default gen_random_uuid();
alter table public.area_quiz_visitas add column if not exists recuperacoes smallint not null default 0;
alter table public.area_quiz_visitas add column if not exists recuperacao_em timestamptz;

alter table public.area_quiz_visitas drop constraint if exists area_quiz_visitas_recuperacoes_check;
alter table public.area_quiz_visitas add constraint area_quiz_visitas_recuperacoes_check check (recuperacoes between 0 and 5);

create index if not exists area_quiz_visitas_recuperacao_idx on public.area_quiz_visitas (visto_em)
  where contact_id is not null and dados is not null and recuperacoes < 2;

comment on column public.area_quiz_visitas.dados is
  'O que a pessoa deu no quiz (nome, nascimento, nome_dele, nascimento_dele, respostas), gravado com o e-mail (0960): o link da recuperação reabre a prévia com isto.';
comment on column public.area_quiz_visitas.recuperacao_chave is
  'Segredo do link de retomada e de saída dos e-mails da recuperação (0960).';
