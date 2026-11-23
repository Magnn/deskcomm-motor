-- 0968 · Instagram pela página do Facebook.
--
-- Até aqui a conta do Instagram só entrava pelo LOGIN DO INSTAGRAM (token da
-- própria conta, graph.instagram.com). Agora ela também entra pela PÁGINA do
-- Facebook a que está ligada: quem conecta a página pelo login do Facebook leva
-- junto a conta do Instagram dela, e o que fala pela conta é o token da PÁGINA
-- (graph.facebook.com) — o mesmo do Messenger.
--
-- `instagram_connections.pagina_id`: o id da página pela qual a conta foi ligada.
--   NULL     = conta do login do Instagram (como sempre foi);
--   não nulo = conta ligada pela página: a resposta privada sai por
--              `/{pagina}/messages`, as chamadas vão a graph.facebook.com, e o token
--              (da página) não expira — por isso fica fora da renovação diária, que
--              já só olha quem tem `token_expires_at`.
--
-- Aditiva e nullable: nada a preencher, nada que o update.sh precise consertar.

set lock_timeout = '5s';

alter table public.instagram_connections
  add column if not exists pagina_id text;

comment on column public.instagram_connections.pagina_id is
  'Id da página do Facebook pela qual a conta foi ligada (login do Facebook). NULL = conta do login do Instagram. Não nulo: chamadas em graph.facebook.com com o token da página, resposta privada por /{pagina}/messages. Migration 0968.';

reset lock_timeout;
