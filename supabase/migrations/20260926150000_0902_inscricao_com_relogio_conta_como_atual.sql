-- 0902 — `com_agente` e `dormente` CONTAM como inscrição "atual" (forward-fix da 0901 e de um defeito anterior a ela)
--
-- ═══ O DEFEITO ═══
--
-- `fn_appointment_enrollment_current` (0224) responde "esta inscrição ainda vale para este nó?" e só reconhece dois
-- status: `active` e `waiting_reply`. Quem pergunta é o guarda de efeito da agenda, que o engine chama em TODO
-- tick sobre a linha que reclamou (`assertAgenda`, `lib/agenda/efeito.ts`). Uma inscrição em qualquer outro status
-- com relógio recebia `false`, o guarda lançava `service_boundary_stale`, e o engine a CANCELAVA com
-- "Atendimento encerrado ou substituído" — sem nunca chegar ao passo do nó.
--
-- Dois status com relógio caem nisso:
--
--   • `com_agente` (0901) — o nó "Agente de IA". A inscrição estaciona nele com o prazo de silêncio como relógio, e
--     no dia em que o prazo vence o tick a cancelava, em vez de sair pela saída de silêncio. Achado ao ligar o
--     motor do nó contra um Postgres de verdade (`tests/invariants/agente-no-fluxo-runtime.test.ts`); nenhum teste
--     de TypeScript o alcança, porque o guarda mora em SQL.
--   • `dormente` (0308) — a espera longa imune à resposta. Reproduzido com a MESMA sonda: uma inscrição `dormente`
--     vencida é cancelada pelo mesmo caminho. O engine até comenta que "a espera longa morre aqui", atribuindo tudo
--     à fronteira de atendimento; esta função é uma segunda causa, e ela não depende de o atendimento ter acabado.
--
-- ═══ O CONSERTO ═══
--
-- A lista de status ganha `dormente` e `com_agente`. É uma lista de status COM RELÓGIO: os que o claim acorda quando
-- `next_eval_at` vence (as mesmas quatro da 0901: `active`, `waiting_reply`, `dormente`, `com_agente`).
--
-- Fica de fora de propósito: `paused_handoff`/`paused_manual` (pausadas por pessoa; o claim não as acorda) e os
-- terminais. A parte de compromisso da função (`appointment_revision`) não muda: inscrição sem compromisso segue
-- valendo enquanto estiver num status vivo.
--
-- ═══ O QUE NÃO ESTÁ AQUI ═══
--
-- `fn_appointment_recover` (no-show) checa "o contato já tem outro fluxo vivo?" com uma lista própria de status que
-- também não inclui `com_agente`. Ela tem 314 linhas e outro dono; o efeito é que uma recuperação de falta poderia
-- tentar abrir uma inscrição ao lado de um agente no comando e bater no índice único de "um vivo por contato" (0901),
-- em vez de responder `other_flow` com elegância. Pendência declarada, não esquecida.
--
-- Idempotente (`create or replace`); os privilégios são os da 0224 (revoke de public/anon/authenticated, execute só
-- para service_role), repetidos aqui para não dependerem do que a função tinha antes.

create or replace function public.fn_appointment_enrollment_current(p_org uuid,p_id uuid,p_node text default null)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.followup_enrollments e where e.organization_id=p_org and e.id=p_id
  and e.status in ('active','waiting_reply','dormente','com_agente') and (p_node is null or e.current_node_id=p_node)
  and (e.appointment_revision is null or exists(select 1 from public.calendar_appointments a
   where a.organization_id=p_org and a.id=e.appointment_id and a.revision=e.appointment_revision and a.status='no_show'
    and a.outcome_recorded_at is not null and a.contact_id=e.contact_id
    and exists(select 1 from public.appointment_recovery_receipts r where r.organization_id=p_org and r.appointment_id=a.id and r.appointment_revision=a.revision and r.result='started' and r.invalidated_at is null))));
$$;
revoke all on function public.fn_appointment_enrollment_current(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fn_appointment_enrollment_current(uuid,uuid,text) to service_role;
