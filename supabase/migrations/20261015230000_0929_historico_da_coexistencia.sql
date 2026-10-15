-- 0929 · O histórico do celular entra no CRM sem virar atendimento.
--
-- ─── O que a Meta entrega ───────────────────────────────────────────────────
-- Num número em COEXISTÊNCIA (o mesmo número no aplicativo WhatsApp Business do
-- celular e na Cloud API), a Meta manda, uma vez e só se o CRM pedir nas 24 h
-- seguintes à conexão, até 180 dias de conversa do aparelho (aviso `history`).
-- São mensagens que JÁ ACONTECERAM, de quem nunca escreveu para o CRM.
--
-- ─── Por que não basta inserir em `messages` ────────────────────────────────
-- Toda mensagem recebida inserida em `messages` é tratada como ENTRADA AGORA:
--   · `trg_demanda_abre_no_inbound` abre demanda e reabre conversa encerrada
--     (status `open`, sem dono, de volta à Fila);
--   · `trg_messages_emit_event` emite `message.received`, que o worker de
--     resposta de IA, o de sentimento e a atribuição de campanha consomem — a IA
--     responderia hoje a mensagem de julho;
--   · `trg_reply_inbound_revision` invalida a resposta que o agente está montando;
--   · o backfill da 0222, que o `update.sh` reaplica a cada atualização, carimba
--     a mensagem no atendimento vigente — e a varredura de silêncio passa a
--     enxergá-la.
-- Importar 180 dias assim encheria a Fila de conversas mortas e poria gente que
-- falou em julho no acompanhamento automático.
--
-- ─── O que esta migration faz ───────────────────────────────────────────────
-- 1 · `messages.imported_at`: quando a mensagem entrou por importação. Nula = a
--     mensagem aconteceu aqui (todas as que existem hoje). Os três gatilhos e o
--     backfill pulam a importada.
-- 2 · `fn_importar_historico_da_conversa`: grava um lote de mensagens de UM
--     contato numa operação. A conversa que ainda não existe nasce ENCERRADA, com
--     `service_closed_at` na última mensagem importada — quando o cliente escrever
--     de novo, `fn_service_inbound` a reabre como faz com qualquer conversa
--     encerrada. A que já existe só ganha os carimbos de hora, nunca para trás, e
--     sem contador de não lidas nem espera na Fila: nada disso é novo.
--
-- Idempotente; sem dado a corrigir (nenhuma mensagem existente é importada).

alter table public.messages add column if not exists imported_at timestamptz;

comment on column public.messages.imported_at is
  'Quando a mensagem entrou por importação de histórico (coexistência do WhatsApp oficial). Nula = aconteceu no CRM. Importada não abre demanda, não reabre conversa e não é carimbada no atendimento.';

-- Corpo do dump, com a saída cedo da importada na frente.
create or replace function public.fn_emit_message_event()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  v_event text;
begin
  if new.imported_at is not null then return new; end if;
  if new.direction = 'inbound' then
    v_event := 'message.received';
  else
    v_event := case new.status
                 when 'sending' then 'message.sending'
                 when 'sent' then 'message.sent'
                 when 'failed' then 'message.failed'
                 else 'message.outbound'
               end;
  end if;

  perform public.fn_log_event(
    new.organization_id, v_event,
    jsonb_build_object(
      'message_id', new.id, 'conversation_id', new.conversation_id,
      'contact_id', new.contact_id, 'direction', new.direction,
      'type', new.type, 'status', new.status, 'external_id', new.external_id,
      'channel_session_id', new.channel_session_id,
      'body_preview', left(new.body, 280)
    )
  );
  return new;
end$$;

create or replace function public.fn_demanda_abre_no_inbound()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.imported_at is not null then return new; end if;
 perform public.fn_service_inbound(new.id); return new;
end; $$;
revoke execute on function public.fn_demanda_abre_no_inbound() from public,anon,authenticated;

create or replace function public.fn_reply_inbound_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.direction='inbound' and new.imported_at is null then
  update public.conversations set reply_context_revision=reply_context_revision+1 where organization_id=new.organization_id and id=new.conversation_id and contact_id=new.contact_id;
 end if;
 return new;
end;$$;
revoke all on function public.fn_reply_inbound_revision() from public,anon,authenticated;

-- p_mensagens: [{ external_id, direction, type, body, sent_at, status,
--                 media_mime, metadata }], todas do mesmo contato.
create or replace function public.fn_importar_historico_da_conversa(
  p_org uuid, p_session uuid, p_contact uuid, p_mensagens jsonb
) returns table(conversation_id uuid, inseridas integer)
language plpgsql security definer set search_path = public as $$
declare
 v_conv uuid;
 v_ultima timestamptz;
 v_inseridas integer := 0;
 v_ultima_in timestamptz;
 v_ultima_out timestamptz;
 v_previa text;
begin
 if jsonb_typeof(p_mensagens) is distinct from 'array' then
   raise exception 'historico_formato_invalido' using errcode='22023';
 end if;
 if not exists (select 1 from public.channel_sessions where id=p_session and organization_id=p_org)
    or not exists (select 1 from public.contacts where id=p_contact and organization_id=p_org) then
   raise exception 'historico_scope_mismatch' using errcode='23503';
 end if;

 select max((x->>'sent_at')::timestamptz) into v_ultima from jsonb_array_elements(p_mensagens) x;
 if v_ultima is null then return query select null::uuid, 0; return; end if;

 perform public.fn_service_lock(p_org, p_contact);

 insert into public.conversations (organization_id, contact_id, channel_session_id, channel, status,
   is_group, unread_count_for_assignee, metadata, status_changed_at, service_closed_at)
 values (p_org, p_contact, p_session, 'whatsapp', 'closed', false, 0, '{}'::jsonb, v_ultima, v_ultima)
 on conflict (organization_id, contact_id, channel_session_id) where is_group = false do nothing
 returning id into v_conv;
 if v_conv is null then
   select c.id into v_conv from public.conversations c
    where c.organization_id=p_org and c.contact_id=p_contact and c.channel_session_id=p_session and not c.is_group;
 end if;

 with novas as (
   insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, direction,
     sent_via, status, type, body, external_id, media_mime, sent_at, metadata, imported_at)
   select p_org, v_conv, p_session, p_contact, x->>'direction',
          case when x->>'direction'='outbound' then 'external_device' else 'crm' end,
          coalesce(x->>'status', case when x->>'direction'='outbound' then 'sent' else 'delivered' end),
          x->>'type', x->>'body', x->>'external_id', x->>'media_mime', (x->>'sent_at')::timestamptz,
          coalesce(x->'metadata', '{}'::jsonb) || jsonb_build_object('origem', 'historico_do_celular'),
          now()
     from (select distinct on (y->>'external_id') y from jsonb_array_elements(p_mensagens) y
            order by y->>'external_id') d(x)
    -- `not exists`, e não `on conflict`: o único de (organização, external_id) é
    -- adiável, e o Postgres não o aceita como árbitro. O lock por contato acima
    -- serializa as re-entregas da Meta.
    where not exists (select 1 from public.messages m
                       where m.organization_id=p_org and m.external_id=x->>'external_id')
   returning direction, sent_at, body
 )
 select count(*)::int,
        max(sent_at) filter (where direction='inbound'),
        max(sent_at) filter (where direction='outbound'),
        (array_agg(left(coalesce(body, ''), 120) order by sent_at desc))[1]
   into v_inseridas, v_ultima_in, v_ultima_out, v_previa
   from novas;

 if v_inseridas > 0 then
   update public.conversations c set
     last_message_preview = case when c.last_message_at is null or v_ultima >= c.last_message_at then v_previa else c.last_message_preview end,
     last_message_at = greatest(c.last_message_at, v_ultima),
     last_inbound_at = greatest(c.last_inbound_at, v_ultima_in),
     last_outbound_at = greatest(c.last_outbound_at, v_ultima_out)
    where c.id=v_conv and c.organization_id=p_org;
   update public.contacts set last_activity_at=greatest(last_activity_at, v_ultima)
    where id=p_contact and organization_id=p_org;
 end if;

 return query select v_conv, v_inseridas;
end; $$;
revoke execute on function public.fn_importar_historico_da_conversa(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_importar_historico_da_conversa(uuid, uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
