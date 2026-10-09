-- ============================================================================
-- 0920 — O USO DE IA É SOMADO NO BANCO
--
-- A tela Uso de IA lia as chamadas de `llm_calls` LINHA POR LINHA pela REST e somava no
-- servidor. A REST devolve no máximo 1.000 linhas por pedido, qualquer que seja o `limit` da
-- consulta. Medido em produção em 09/10/2026: a organização tinha 177.579 chamadas em 30 dias
-- (3,5 bilhões de tokens) e a tela mostrava "1.000 atendimentos" e US$ 0,89 — as 1.000 mais
-- ANTIGAS do período. As contagens de mensagem recebida e de passagem para uma pessoa tinham o
-- mesmo corte.
--
-- As duas funções devolvem UM valor jsonb (não linhas): 90 dias × as finalidades também
-- passariam de 1.000 linhas. São SECURITY INVOKER — a organização é isolada pelas políticas das
-- tabelas, como já era na leitura direta.
-- ============================================================================

create or replace function public.fn_uso_de_ia(
  p_org uuid,
  p_de timestamptz,
  p_ate timestamptz,
  p_agente uuid default null,
  p_finalidade text default null
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  -- `nivel`: 0 = um dia e uma finalidade; 1 = o dia inteiro; 3 = o período inteiro. Os percentis
  -- de tempo saem daqui, por nível, porque percentil não se soma: o do período não é a média dos
  -- dias. `percentile_disc` devolve um valor que EXISTE na amostra, como a conta antiga fazia.
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
  from (
    select
      grouping(c.dia, c.finalidade)::int as nivel,
      c.dia,
      c.finalidade,
      count(*)::bigint as chamadas,
      coalesce(sum(c.input_tokens), 0)::bigint as tokens_de_entrada,
      coalesce(sum(c.output_tokens), 0)::bigint as tokens_de_saida,
      coalesce(sum(c.cache_read_tokens), 0)::bigint as tokens_reaproveitados,
      coalesce(sum(c.cost_cents), 0)::numeric as custo_cents,
      count(*) filter (
        where c.cost_cents is null and coalesce(c.input_tokens, 0) + coalesce(c.output_tokens, 0) > 0
      )::bigint as chamadas_sem_preco,
      coalesce(percentile_disc(0.5) within group (order by c.latency_ms) filter (where c.latency_ms > 0), 0)::int as p50_ms,
      coalesce(percentile_disc(0.95) within group (order by c.latency_ms) filter (where c.latency_ms > 0), 0)::int as p95_ms
    from (
      select
        (l.created_at at time zone 'UTC')::date as dia,
        coalesce(l.purpose, 'turno') as finalidade,
        l.input_tokens, l.output_tokens, l.cache_read_tokens, l.cost_cents, l.latency_ms
      from public.llm_calls l
      where l.organization_id = p_org
        and l.created_at >= p_de
        and l.created_at <= p_ate
        and (p_agente is null or l.agent_id = p_agente)
        and (p_finalidade is null or l.purpose = p_finalidade)
    ) c
    group by grouping sets ((c.dia, c.finalidade), (c.dia), ())
  ) g;
$function$;

comment on function public.fn_uso_de_ia(uuid, timestamptz, timestamptz, uuid, text)
  is 'A tela Uso de IA: chamadas, tokens (entrada, saída, reaproveitados), custo e tempo de resposta, somados NO BANCO por dia e por finalidade. SECURITY INVOKER: quem isola a organização é a política de llm_calls.';

revoke execute on function public.fn_uso_de_ia(uuid, timestamptz, timestamptz, uuid, text) from public, anon;
grant  execute on function public.fn_uso_de_ia(uuid, timestamptz, timestamptz, uuid, text) to authenticated, service_role;

create or replace function public.fn_recebidas_e_passagens_por_dia(
  p_org uuid,
  p_de timestamptz,
  p_ate timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
  from (
    select x.dia, sum(x.recebidas)::bigint as recebidas, sum(x.passagens)::bigint as passagens
    from (
      select (m.created_at at time zone 'UTC')::date as dia, count(*) as recebidas, 0::bigint as passagens
      from public.messages m
      where m.organization_id = p_org and m.direction = 'inbound'
        and m.created_at >= p_de and m.created_at <= p_ate
      group by 1
      union all
      select (e.created_at at time zone 'UTC')::date, 0::bigint, count(*)
      from public.event_log e
      where e.organization_id = p_org and e.event_type = 'ai.handoff_triggered'
        and e.created_at >= p_de and e.created_at <= p_ate
      group by 1
    ) x
    group by x.dia
  ) d;
$function$;

comment on function public.fn_recebidas_e_passagens_por_dia(uuid, timestamptz, timestamptz)
  is 'A tela Uso de IA: mensagens recebidas e passagens para uma pessoa, contadas NO BANCO por dia. SECURITY INVOKER: quem isola a organização são as políticas de messages e event_log.';

revoke execute on function public.fn_recebidas_e_passagens_por_dia(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.fn_recebidas_e_passagens_por_dia(uuid, timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
