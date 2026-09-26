-- 0901 — o status `com_agente`: um agente de IA conduz a conversa dentro de um fluxo
--
-- ═══ O QUE ISTO PREPARA ═══
--
-- O construtor de fluxos vai ganhar o nó "Agente de IA": o cliente escolhe, no
-- ponto do fluxo que quiser, um agente já configurado em Agentes, e é ele quem
-- conversa com a pessoa até concluir a etapa, esgotar os turnos ou a pessoa
-- calar. Esta migration é a FATIA 1 (do banco): sozinha ela não muda nada que
-- alguém veja — nenhum código escreve `com_agente` ainda. O nó, o runtime e a
-- tela vêm nas fatias seguintes, e o nó só aparece na paleta na última.
--
-- ═══ POR QUE UM STATUS NOVO, E NÃO UM EXISTENTE ═══
--
-- Enquanto o agente conduz, a inscrição precisa de TRÊS coisas ao mesmo tempo, e
-- nenhum status atual as tem juntas:
--
--   1. IMUNE À RESPOSTA. Cada mensagem da pessoa é um turno do agente, não um
--      motivo para cancelar ou acordar o fluxo. `LIVE_STATUSES` em
--      `lib/followup/reactivity.ts` (active, waiting_reply, paused_handoff) é o
--      que a reatividade carrega quando o contato escreve — por isso o agente no
--      comando não pode morar em nenhum deles.
--   2. COM RELÓGIO. O silêncio da pessoa é uma saída do nó: alguém tem de acordar
--      a inscrição quando o prazo vence. Só o claim acorda, e o claim só enxerga
--      status com `next_eval_at`.
--   3. UM RÓTULO QUE NÃO MENTE. `dormente` (espera longa imune, 0308) tem 1 e 2,
--      mas na fila diz "Aguardando a data do retorno" — uma conversa ao vivo com
--      um agente não é isso, e `coletando` (roteiro de atendimento, 0394) é
--      conduzido pelo turno e SEM relógio.
--
-- ═══ O QUE MUDA, E O QUE FICA DE FORA DE PROPÓSITO ═══
--
--   Muda:
--   - o vocabulário de status e a coerência de relógio (`com_agente` TEM
--     `next_eval_at`, como `active`/`waiting_reply`/`dormente`);
--   - o índice do claim e a função `fn_claim_due_followup_enrollments`, nas DUAS
--     listas dela — sem isso a inscrição espera o silêncio e NUNCA acorda: nada
--     reclama a linha, nada reprova (a mesma armadilha da 0308);
--   - o índice único de "um follow-up vivo por contato": `com_agente` OCUPA a
--     vaga. Ao contrário do `dormente`, quem está numa conversa com um agente não
--     pode entrar noutra cadência ao mesmo tempo — seriam duas vozes.
--
--   Fica de fora, como o `dormente`, e é decisão da v1:
--   - as regras SQL de reagendamento por compromisso (`fn_appointment_*`) e a de
--     fusão de contato por 9º dígito. A vida do `com_agente` é limitada pelo
--     próprio nó (máximo de turnos e prazo de silêncio), e ligar a conversa de
--     um agente ao ciclo de vida de um agendamento é uma regra de produto que
--     ninguém decidiu.
--   - o roteiro de atendimento: o gatilho da 0394 já recusa qualquer status fora
--     de `coletando/completed/cancelled/dead` em ponteiro dessa superfície, então
--     `com_agente` só existe em `followup` e `crm_automation`.
--
--   O opt-out e a LGPD alcançam o `com_agente` (hard stop): isso vive em
--   TypeScript (`STATUS_ALCANCADOS_PELO_OPT_OUT`, `STATUS_DA_REGUA_VIVA`), não
--   aqui.
--
-- Re-aplicável: os dois CHECKs só AMPLIAM o conjunto aceito, o predicado novo dos
-- índices cobre todas as linhas do antigo, e nenhum banco tem `com_agente` antes
-- desta migration — não há o que deduplicar nem backfillar.

-- ---- 1. vocabulário de status ----------------------------------------------
alter table public.followup_enrollments
  drop constraint if exists followup_enrollments_status_valido;
alter table public.followup_enrollments
  add constraint followup_enrollments_status_valido
  check (status in ('active','waiting_reply','dormente','paused_handoff','paused_manual','coletando','com_agente','completed','cancelled','dead'));

-- ---- 2. coerência de relógio -----------------------------------------------
--
-- `com_agente` entra na perna COM relógio: é o `next_eval_at` (o prazo de
-- silêncio do nó) que o acorda, pelo mesmo claim de sempre. Um `com_agente` sem
-- relógio seria uma conversa que ninguém encerra e que ninguém vê parar.
alter table public.followup_enrollments
  drop constraint if exists followup_enrollments_relogio_coerente;
alter table public.followup_enrollments
  add constraint followup_enrollments_relogio_coerente
  check (
    (status in ('active','waiting_reply','dormente','com_agente') and next_eval_at is not null)
    or (status in ('paused_handoff','paused_manual','coletando','completed','cancelled','dead'))
  );

-- ---- 3. um follow-up vivo por contato: `com_agente` ocupa a vaga -------------
--
-- O predicado de um índice não se altera: derruba e recria. O guard só derruba o
-- que ainda não conhece `com_agente`, então reaplicar o arquivo não refaz o índice
-- à toa. O `create` logo abaixo é o de sempre, com a lista final.
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'idx_followup_enrollments_one_live'
      and indexdef not ilike '%com_agente%'
  ) then
    execute 'drop index public.idx_followup_enrollments_one_live';
  end if;
end
$$;
create unique index if not exists idx_followup_enrollments_one_live
  on public.followup_enrollments (organization_id, contact_id)
  where status in ('active','waiting_reply','paused_handoff','paused_manual','com_agente');

-- ---- 4. o claim tem de enxergar o com_agente ---------------------------------
--
-- ⚠️ É AQUI QUE ESTA MIGRATION FALHA CALADA se alguém a encurtar. Sem `com_agente`
-- nas duas listas da função, a conversa espera o silêncio e NUNCA acorda: o nó não
-- sai por `silencio`, a inscrição fica presa e nada acusa.
--
-- O índice de apoio tem o mesmo predicado da função: sem ele o planner não o usa
-- (o predicado do índice parcial precisa estar implicado pela consulta).
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'idx_followup_enrollments_due_por_org'
      and indexdef not ilike '%com_agente%'
  ) then
    execute 'drop index public.idx_followup_enrollments_due_por_org';
  end if;
end
$$;
create index if not exists idx_followup_enrollments_due_por_org
  on public.followup_enrollments (organization_id, next_eval_at)
  where status in ('active','waiting_reply','dormente','com_agente');

create or replace function fn_claim_due_followup_enrollments(p_limit int, p_lease_seconds int)
returns setof followup_enrollments
language sql
security definer
set search_path = public
as $$
  with orgs as (
    -- Sem a condição de claim aqui de propósito: o lateral abaixo a aplica, e uma
    -- organização cujos vencidos estão todos com lease apenas devolve zero linhas.
    select distinct organization_id
      from followup_enrollments
     where status in ('active','waiting_reply','dormente','com_agente')
       and next_eval_at <= now()
  ),
  fila as (
    select f.id, f.next_eval_at, f.posicao_na_org
      from orgs
      cross join lateral (
        select d.id,
               d.next_eval_at,
               row_number() over (order by d.next_eval_at) as posicao_na_org
          from followup_enrollments d
         where d.organization_id = orgs.organization_id
           and d.status in ('active','waiting_reply','dormente','com_agente')
           and d.next_eval_at <= now()
           and (d.claimed_until is null or d.claimed_until < now())
         order by d.next_eval_at
         limit p_limit
      ) f
  ),
  escolhidos as (
    -- O rodízio: posição 1 de todas as organizações, depois a 2 de todas, etc.
    -- Empate na mesma posição vai para quem esperou mais.
    select id from fila order by posicao_na_org, next_eval_at limit p_limit
  ),
  travados as (
    select e.id from followup_enrollments e
     where e.id in (select id from escolhidos)
     for update skip locked
  )
  update followup_enrollments e
     set claimed_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where e.id in (select id from travados)
     -- A condição de lease É REPETIDA AQUI, e não é redundante com a CTE `fila`.
     -- Sem ela, duas conexões simultâneas reclamam as MESMAS linhas: a segunda
     -- espera o lock da primeira, e quando ele sai o Postgres (READ COMMITTED)
     -- reavalia só o WHERE do UPDATE — que não olhava `claimed_until` — e grava
     -- por cima. O `skip locked` da CTE não salva: as duas materializam a mesma
     -- lista antes de qualquer lock existir. Medido: interseção de 5 em 5 no
     -- invariante de concorrência (followup-schema.test.ts).
     and (e.claimed_until is null or e.claimed_until < now())
  returning e.*;
$$;

revoke execute on function fn_claim_due_followup_enrollments(int, int) from public, anon, authenticated;
grant execute on function fn_claim_due_followup_enrollments(int, int) to service_role;

notify pgrst, 'reload schema';
