-- 0945 · O quarto quiz da página: "O Retrato do Par" (Vênus + Descendente, `lib/area-do-cliente/retrato-do-par.ts`).
--
-- Só ALARGA três CHECKs para aceitar o valor 'par' — nenhuma linha existente deixa de passar, nada é reescrito:
--   • area_quiz_pedidos.tipo   (os pedidos dos quizzes de uma pessoa, 0943)
--   • area_quiz_visitas.quiz   (o funil medido por nós, 0944)
--   • area_quiz_passos.quiz
-- As constraints são as de nome automático das 0943/0944; `drop ... if exists` + `add` deixa idempotente.

alter table public.area_quiz_pedidos drop constraint if exists area_quiz_pedidos_tipo_check;
alter table public.area_quiz_pedidos add constraint area_quiz_pedidos_tipo_check check (tipo in ('prosperidade', 'caminhos', 'par'));

alter table public.area_quiz_visitas drop constraint if exists area_quiz_visitas_quiz_check;
alter table public.area_quiz_visitas add constraint area_quiz_visitas_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par'));

alter table public.area_quiz_passos drop constraint if exists area_quiz_passos_quiz_check;
alter table public.area_quiz_passos add constraint area_quiz_passos_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par'));
