-- 0947 · O FUNIL DA PÁGINA DE VENDAS, medido como o dos quizzes (0944).
--
-- Pedido do dono em 24/10/2026: "analisar os leads na página igual fizemos com o quiz". A página de vendas
-- estática (ex.: acassia.tech/mandalas) passa a mandar os passos para a mesma rota pública e as mesmas tabelas:
--   • `quiz = 'pagina'` + `pagina` (o slug da página: 'mandalas') — uma página nova não precisa de migration;
--   • passos novos: 'meio' (leu até o meio), 'oferta' (viu o preço), 'comprar' (clicou no checkout) e
--     'whatsapp' (chamou no WhatsApp — passo LATERAL, não avança o funil);
--   • `anuncio` (o `utm_content`: qual anúncio trouxe a visita), nas duas tabelas.
--
-- Só ALARGA CHECKs e acrescenta colunas anuláveis: nenhuma linha existente deixa de passar, nada é reescrito.
-- As constraints são as de nome automático da 0944 (e da 0945); `drop ... if exists` + `add` deixa idempotente.

alter table public.area_quiz_visitas drop constraint if exists area_quiz_visitas_quiz_check;
alter table public.area_quiz_visitas add constraint area_quiz_visitas_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par', 'pagina'));
alter table public.area_quiz_passos drop constraint if exists area_quiz_passos_quiz_check;
alter table public.area_quiz_passos add constraint area_quiz_passos_quiz_check check (quiz in ('sinastria', 'prosperidade', 'caminhos', 'par', 'pagina'));

alter table public.area_quiz_visitas drop constraint if exists area_quiz_visitas_passo_check;
alter table public.area_quiz_visitas add constraint area_quiz_visitas_passo_check check (passo in ('abriu', 'dados', 'perguntas', 'email', 'previa', 'pagar', 'cobranca', 'pago', 'leitura', 'meio', 'oferta', 'comprar', 'whatsapp'));
alter table public.area_quiz_passos drop constraint if exists area_quiz_passos_passo_check;
alter table public.area_quiz_passos add constraint area_quiz_passos_passo_check check (passo in ('abriu', 'dados', 'perguntas', 'email', 'previa', 'pagar', 'cobranca', 'pago', 'leitura', 'meio', 'oferta', 'comprar', 'whatsapp'));

alter table public.area_quiz_visitas add column if not exists pagina text check (pagina is null or pagina ~ '^[a-z0-9-]{1,40}$');
alter table public.area_quiz_visitas add column if not exists anuncio text check (anuncio is null or char_length(anuncio) <= 80);
alter table public.area_quiz_passos add column if not exists pagina text check (pagina is null or pagina ~ '^[a-z0-9-]{1,40}$');
alter table public.area_quiz_passos add column if not exists anuncio text check (anuncio is null or char_length(anuncio) <= 80);
