-- 0923 · A política de leitura de `conversations` decide por ORGANIZAÇÃO antes de decidir por linha.
--
-- ─── O que foi medido (produção, 11/10/2026) ────────────────────────────────
-- Com 2.217 conversas, só a política de leitura custava 170 ms por consulta: `conversations_select`
-- chama `fn_can_view_conversation(organization_id, assigned_to_user_id)` em CADA linha, e a função
-- (SECURITY DEFINER, com subconsultas) não é embutida pelo planner — cada chamada é uma execução à
-- parte que lê `platform_admins` e `user_organizations` de novo. A lista do Inbox e os contadores
-- das abas fazem essa leitura várias vezes por atualização: média de 0,9 a 1,2 s por consulta
-- sob carga, com 10 conexões na camada de dados. Entre 12:50 e 12:56 UTC elas se esgotaram
-- ("Timed out acquiring connection from connection pool"): sessões caíram e uma mensagem
-- recebida não foi gravada.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
-- Para quem enxerga a organização INTEIRA — administrador da plataforma e os papéis `viewer`,
-- `manager` e `admin` — a resposta não depende da linha. `fn_orgs_com_conversas_todas_visiveis()`
-- devolve essas organizações, e a política testa a pertinência antes da função por linha. O
-- planner avalia o conjunto UMA vez por consulta. Medido com a mesma expressão: 170 ms → 1,7 ms.
--
-- ─── Por que a visibilidade não muda ────────────────────────────────────────
-- 1. A função por linha continua na política, do outro lado de um OR. O OR só pode ACRESCENTAR
--    linhas, e só acrescenta as de organizações em que a função por linha já devolve `true` para
--    toda linha: os dois primeiros ramos de `fn_can_view_conversation` são exatamente
--    `fn_is_platform_admin()` e `fn_user_role_in_org(org) in ('viewer','manager','admin')`.
-- 2. A função nova usa AS MESMAS duas funções, sobre as organizações candidatas. As candidatas
--    são as de `fn_user_org_ids()` (vínculo ativo + organização em suporte), que é o único
--    domínio em que `fn_user_role_in_org` devolve papel.
-- 3. O papel `agent` não entra no conjunto: para ele a decisão segue por linha, como antes.
-- A equivalência é provada em `tests/invariants/conversas-visiveis-por-organizacao.test.ts`.

create or replace function public.fn_orgs_com_conversas_todas_visiveis()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select o.id
    from public.organizations o
   where (select public.fn_is_platform_admin())
  union
  select org
    from public.fn_user_org_ids() as org
   where public.fn_user_role_in_org(org) in ('viewer', 'manager', 'admin');
$function$;

comment on function public.fn_orgs_com_conversas_todas_visiveis()
  is 'Organizações em que quem chama enxerga TODAS as conversas (administrador da plataforma; viewer, manager ou admin). Atalho da política conversations_select: avaliado uma vez por consulta, antes de fn_can_view_conversation por linha (migration 0923).';

revoke execute on function public.fn_orgs_com_conversas_todas_visiveis() from public, anon;
grant  execute on function public.fn_orgs_com_conversas_todas_visiveis() to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    organization_id in (select public.fn_orgs_com_conversas_todas_visiveis())
    or public.fn_can_view_conversation(organization_id, assigned_to_user_id)
  );

notify pgrst, 'reload schema';
