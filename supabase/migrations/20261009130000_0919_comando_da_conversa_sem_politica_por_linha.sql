-- 0919 · A lista de conversas do Inbox deixa de pagar a política de `contacts` por linha.
--
-- ─── O que foi medido (produção, 09/10/2026) ────────────────────────────────
-- Com 1.325 conversas, a consulta da lista (`?comando_da_conversa=in.(...)`) levava 2.078 ms e
-- lia 55 mil blocos na sessão de um usuário — e 44 ms como dono do banco. Com o Inbox aberto e
-- atualizando, o banco ia a 450–550% de CPU com 40 dessas consultas a cada 20 segundos.
--
-- A causa: `comando_da_conversa(c)` tem `SET search_path` e subconsultas, então o planner não a
-- embute. Cada chamada é uma execução à parte, e dentro dela a política de `contacts`
-- (`organization_id in (select fn_user_org_ids()) or fn_is_platform_admin()`) roda de novo, do
-- zero. A função é avaliada uma vez POR CONVERSA da organização — como filtro, antes do limite.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
-- A função passa a ser SECURITY DEFINER e lê o contato UMA vez. Medido com a função trocada
-- dentro de uma transação desfeita: 166 ms, 7,5 mil blocos, e o mesmo valor nas 1.325 conversas.
--
-- ─── Por que isto não abre o contato de outra organização ───────────────────
-- 1. A LINHA de conversa continua vindo pela política de `conversations`: a função só é
--    avaliada sobre o que a pessoa já pode ver.
-- 2. O contato lido tem de ser da MESMA organização da conversa recebida (`ct.organization_id =
--    c.organization_id`). Antes esse casamento era feito pela política; agora é da consulta.
-- 3. O que sai é uma de quatro palavras, nunca um dado do contato.
-- 4. `anon` e `PUBLIC` seguem sem EXECUTE (as duas origens, como a doutrina pede).
-- Quem chamasse a função à mão com uma linha forjada precisaria já conhecer o id da organização
-- e o id do contato alheios para aprender se ele está travado — e não aprende mais nada.

create or replace function public.comando_da_conversa(c public.conversations)
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- Uma leitura do contato (eram duas), feita como dono da função: sob a política de `contacts`
  -- cada chamada reexecutava `fn_user_org_ids()` — e esta função roda uma vez POR CONVERSA.
  -- `left join` a partir de uma linha fixa: contato ausente continua devolvendo linha, com as
  -- duas travas em `false`, como o `coalesce` de antes garantia.
  select public.fn_comando_da_conversa(
    c.status,
    c.assigned_to_user_id,
    c.bot_silenced_until,
    coalesce(ct.force_human, false),
    coalesce(ct.is_blocked, false),
    now()
  )
  from (select 1) uma_linha
  left join public.contacts ct
    on ct.id = c.contact_id and ct.organization_id = c.organization_id;
$function$;

comment on function public.comando_da_conversa(public.conversations)
  is 'Campo calculado exposto pelo PostgREST: ?select=comando_da_conversa e ?comando_da_conversa=in.(...). Resolve o contato e carimba now(). SECURITY DEFINER desde a 0919: lê só as duas travas do contato DA MESMA organização da conversa recebida.';

revoke execute on function public.comando_da_conversa(public.conversations) from public, anon;
grant  execute on function public.comando_da_conversa(public.conversations) to authenticated, service_role;

notify pgrst, 'reload schema';
