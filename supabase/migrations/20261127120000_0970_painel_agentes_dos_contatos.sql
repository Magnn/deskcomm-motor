-- 0970 · O painel por funil: que agente atendeu cada contato.
--
-- O painel separa a venda pelo funil onde ela fechou (`lib/resultado/funis.ts`). Para a venda
-- de conversa, o funil é o agente que falou com a pessoa: a mensagem enviada guarda o agente em
-- `messages.metadata.ai_actor_id`. Ler isso pela REST baixaria cada mensagem (medido em 27/11/2026:
-- 33 mil mensagens para 163 compradores de um mês) e a REST corta a resposta em 1.000 linhas,
-- perdendo contatos em silêncio. A função agrupa no banco: uma linha por (contato, agente), com
-- a última mensagem até `p_ate`.
--
-- `security invoker`: quem chama é o servidor (service_role), que já filtra a organização; a
-- função não dá alcance novo a ninguém. Revogada de anon/authenticated (as duas origens).
--
-- Aditiva: só a função.

set lock_timeout = '5s';

create or replace function public.fn_painel_agentes_dos_contatos(p_org uuid, p_contatos uuid[], p_ate timestamptz)
returns table (contact_id uuid, agent_id uuid, ultima_em timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select m.contact_id, (m.metadata->>'ai_actor_id')::uuid as agent_id, max(m.created_at) as ultima_em
    from public.messages m
   where m.organization_id = p_org
     and m.contact_id = any(p_contatos)
     and m.direction = 'outbound'
     and m.created_at <= p_ate
     and (m.metadata->>'ai_actor_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   group by m.contact_id, (m.metadata->>'ai_actor_id')::uuid
$$;

revoke execute on function public.fn_painel_agentes_dos_contatos(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fn_painel_agentes_dos_contatos(uuid, uuid[], timestamptz) to service_role;

comment on function public.fn_painel_agentes_dos_contatos(uuid, uuid[], timestamptz) is
  'Painel por funil: por contato, cada agente que enviou mensagem e a última até p_ate. Server-side only. Migration 0970.';
