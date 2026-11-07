-- 0961 · O quinto quiz da página: "O Código da Sombra" (a Sombra dele e o nível dela, `lib/area-do-cliente/quizzes.ts`).
--
-- Só ALARGA três CHECKs para aceitar o valor 'sombra' — nenhuma linha existente deixa de passar, nada é reescrito:
--   • area_quiz_pedidos.tipo   (os pedidos dos quizzes de uma pessoa, 0943/0945)
--   • area_quiz_visitas.quiz   (o funil medido por nós, 0944/0947)
--   • area_quiz_passos.quiz
-- `drop ... if exists` + `add` deixa idempotente. `lock_timeout`: o atendimento não espera o ALTER (lição de 11/10).

set lock_timeout = '5s';

alter table public.area_quiz_pedidos drop constraint if exists area_quiz_pedidos_tipo_check;
alter table public.area_quiz_pedidos add constraint area_quiz_pedidos_tipo_check check (tipo in ('prosperidade', 'caminhos', 'par', 'sombra'));

alter table public.area_quiz_visitas drop constraint if exists area_quiz_visitas_quiz_check;
alter table public.area_quiz_visitas add constraint area_quiz_visitas_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par', 'sombra', 'pagina'));

alter table public.area_quiz_passos drop constraint if exists area_quiz_passos_quiz_check;
alter table public.area_quiz_passos add constraint area_quiz_passos_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par', 'sombra', 'pagina'));
