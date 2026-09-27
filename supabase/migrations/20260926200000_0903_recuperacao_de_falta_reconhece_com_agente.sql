-- 0903 — `fn_appointment_recover` reconhece `com_agente` no PRÓPRIO guarda de "outro fluxo vivo"
-- (forward-fix da pendência declarada na 0902)
--
-- ═══ O QUE A 0902 DIZIA, E O QUE O CÓDIGO REALMENTE FAZ ═══
--
-- A 0902 declarou como pendência: "`fn_appointment_recover` (no-show) checa 'o contato já tem outro fluxo
-- vivo?' com uma lista própria de status que também não inclui `com_agente`... o efeito é que uma
-- recuperação de falta poderia tentar abrir uma inscrição ao lado de um agente no comando e bater no índice
-- único de 'um vivo por contato' (0901), em vez de responder `other_flow` com elegância."
--
-- Rastreado contra o código: isso está incompleto. O `insert` que tentaria abrir a nova inscrição já mora
-- dentro de um `begin ... exception when unique_violation then result:='other_flow'; end;` — o MESMO bloco
-- que já converte qualquer outro conflito do índice único em `other_flow`, com elegância, para `active`,
-- `waiting_reply`, `paused_handoff` e `paused_manual`. Uma falta cujo contato está `com_agente` JÁ recebe
-- `other_flow` hoje, só que pelo caminho caro: a função resolve candidatos, ponteiro, versão, agente, nó do
-- gatilho e a fronteira de serviço (`fn_service_event_origin`) ANTES de tentar o insert e descobrir, pela
-- exceção, que não havia vaga. Trabalho jogado fora, não erro.
--
-- ═══ O CONSERTO ═══
--
-- Só adianta a checagem: `com_agente` entra na MESMA lista que `active`/`waiting_reply`/`paused_handoff`/
-- `paused_manual` já usam no `exists(...)` de "outro fluxo vivo", a poucas linhas do início da função — a
-- mesma lista que ocupa a vaga do índice único `idx_followup_enrollments_one_live` (0901). O resultado
-- (`other_flow`) não muda; o caminho para chegar nele fica mais barato e para de depender de uma exceção
-- disparada de propósito.
--
-- `dormente` continua de fora, e é o comportamento CERTO: ao contrário de `com_agente`, `dormente` não ocupa
-- a vaga do índice único (0901 é explícita sobre isso — "ao contrário do dormente, quem está numa conversa
-- com um agente não pode entrar noutra cadência ao mesmo tempo"), então uma recuperação de falta pode abrir
-- uma inscrição nova ao lado de uma `dormente` sem conflito nenhum; incluí-la aqui mudaria o comportamento
-- (recusaria uma recuperação que hoje é aceita), o que não foi pedido nem é o defeito descrito.
--
-- Idempotente (`create or replace`); privilégios repetidos como na 0224/0229/0902, para não dependerem do
-- que a função tinha antes.

create or replace function public.fn_appointment_recover(p_org uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.event_log; a public.calendar_appointments; r public.appointment_recovery_receipts;
 contact uuid; rev bigint; result text; candidates uuid[]; pointer uuid; agent uuid; version uuid; node text; boundary jsonb; enrollment uuid;
begin
 select * into e from public.event_log where organization_id=p_org and id=p_event and event_type='appointment.outcome_confirmed' and entity_kind='appointment';
 if not found then raise exception 'appointment_source_event_missing' using errcode='P0002'; end if;
 rev:=(e.payload->>'appointment_revision')::bigint;
 select contact_id into contact from public.calendar_appointments where organization_id=p_org and id=e.entity_id;
 if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
 if contact is not null then perform public.fn_service_lock(p_org,contact); end if;
 select * into a from public.calendar_appointments where organization_id=p_org and id=e.entity_id for update;
 if a.contact_id is distinct from contact then raise exception 'appointment_stale' using errcode='40001'; end if;
 select * into r from public.appointment_recovery_receipts where organization_id=p_org and appointment_id=a.id and appointment_revision=rev;
 if found then return to_jsonb(r); end if;
 result:=case when contact is null then 'no_contact' when a.revision<>rev or a.status<>'no_show' or a.outcome_recorded_at is null

  or not exists(select 1 from public.contacts where organization_id=p_org and id=contact and not is_anonymized and is_merged_into is null and not is_blocked)
  then 'stale' else null end;
 if result is null then
  select array_agg(p.id) into candidates from public.followup_flow_pointers p
   where p.organization_id=p_org and p.status='active' and p.active_version_id is not null and p.trigger_config->>'kind'='appointment_no_show'
    and (coalesce(jsonb_array_length(p.trigger_config->'params'->'event_type_ids'),0)=0 or p.trigger_config->'params'->'event_type_ids' ? a.event_type_id::text)
    and exists(select 1 from public.ai_agent_versions v where v.organization_id=p_org and v.status='published'
     and v.followup->'enabled'='true'::jsonb and v.followup->'flow_pointer_ids' ? p.id::text);
  result:=case when coalesce(cardinality(candidates),0)=0 then 'not_configured' when cardinality(candidates)>1 then 'ambiguous' else null end;
 end if;
 -- 0903: `com_agente` (0901) ocupa a MESMA vaga do índice único que os quatro status abaixo — checar aqui
 -- evita resolver candidato/ponteiro/versão/agente/nó e a fronteira de serviço só para descobrir pela
 -- exceção, lá na frente, que não havia vaga.
 if result is null and exists(select 1 from public.followup_enrollments where organization_id=p_org and contact_id=contact and status in ('active','waiting_reply','paused_handoff','paused_manual','com_agente')) then result:='other_flow'; end if;
 if result is null then
  pointer:=candidates[1];
  select active_version_id into version from public.followup_flow_pointers where organization_id=p_org and id=pointer and status='active' for share;
  -- Precedência de AGENTES já canônica em resolveAgentForAutomaticTrigger.
  select agent_id into agent from public.ai_agent_versions where organization_id=p_org and status='published'
   and followup->'enabled'='true'::jsonb and followup->'flow_pointer_ids' ? pointer::text order by agent_id limit 1;
  select n->>'id' into node from public.followup_flow_versions v cross join lateral jsonb_array_elements(v.graph->'nodes') n
   where v.organization_id=p_org and v.id=version and n->>'type'='trigger';
  if version is null or agent is null or node is null then raise exception 'appointment_flow_changed' using errcode='40001'; end if;
  begin
   boundary:=public.fn_service_event_origin(p_org,p_event,contact,
    (select channel_session_id from public.conversations where organization_id=p_org and id=a.conversation_id and contact_id=contact));
  exception when serialization_failure then result:='stale'; end;
  if result is null then
   begin
    insert into public.followup_enrollments(organization_id,pointer_id,version_id,contact_id,conversation_id,agent_id,current_node_id,service_boundary,
     appointment_id,appointment_revision)
    values(p_org,pointer,version,contact,(boundary->>'conversation_id')::uuid,agent,node,boundary,a.id,a.revision) returning id into enrollment;
    insert into public.followup_enrollment_events(organization_id,enrollment_id,node_id,event_type,payload,idempotency_key)
     values(p_org,enrollment,node,'enrolled',jsonb_build_object('trigger_kind','appointment_no_show','appointment_id',a.id,'appointment_revision',a.revision),'appointment:'||a.id||':'||a.revision);
    result:='started';
   exception when unique_violation then result:='other_flow'; end;
  end if;
 end if;
 insert into public.appointment_recovery_receipts(organization_id,appointment_id,appointment_revision,source_event_id,result,pointer_id,enrollment_id)
  values(p_org,a.id,rev,p_event,result,pointer,enrollment) returning * into r;
 if result<>'started' and not exists(select 1 from public.contacts where organization_id=p_org and id=contact and is_anonymized) then
  insert into public.agent_inbox_items(organization_id,kind,severity,title,body,ref_kind,ref_id,appointment_revision)
   values(p_org,'appointment_recovery_review','warn','A recuperação não foi iniciada',
    case result when 'other_flow' then 'Este contato já tem outro acompanhamento. Revise o próximo passo; nenhuma recuperação ficou aguardando vaga.'
     when 'ambiguous' then 'Mais de um fluxo atende a esta falta. Deixe apenas um configurado ou escolha manualmente o próximo passo.'
     when 'not_configured' then 'Configure um fluxo de recuperação e habilite-o em um assistente publicado. Esta falta não será iniciada retroativamente.'
     else 'O contexto mudou ou não há contato vinculado. Abra o compromisso e escolha o próximo passo.' end,'appointment',a.id,rev)
   on conflict(organization_id,ref_id,appointment_revision,kind) where ref_kind='appointment' and appointment_revision is not null do nothing;
 end if;
 return to_jsonb(r);
end; $$;

revoke all on function public.fn_appointment_recover(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fn_appointment_recover(uuid,uuid) to service_role;
