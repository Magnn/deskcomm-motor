-- ============================================================================
-- 0922 — RESULTADO POR ANÚNCIO
--
-- Cada contato guarda de qual anúncio veio (`contacts.source_metadata.ad_id`, gravado pela
-- atribuição do clique). Faltava a conta que usa isso: de quem cada anúncio trouxe, quantos
-- conversaram, ouviram o preço, receberam link e COMPRARAM, e quanto renderam. Sem ela, o custo
-- por venda de um anúncio só existia cruzando planilha — e a plataforma de anúncio, que otimiza
-- por conversa, não sabe dizer qual criativo vende.
--
-- Somado no banco e devolvido como UM valor jsonb: a REST corta listas em 1.000 linhas.
-- ============================================================================

create or replace function public.fn_resultado_por_anuncio(
  p_org uuid,
  p_de timestamptz,
  p_ate timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  -- A COORTE é de quem ENTROU no período: o anúncio é julgado pelas pessoas que ele trouxe, e a
  -- compra delas conta mesmo que tenha acontecido depois do fim do período.
  with entrada as (
    select c.id,
           nullif(c.source_metadata->>'ad_id', '') as anuncio,
           nullif(c.source_metadata->>'ad_title', '') as titulo
    from public.contacts c
    where c.organization_id = p_org and c.created_at >= p_de and c.created_at <= p_ate
  ), conversa as (
    select m.contact_id,
           count(*) filter (where m.direction = 'inbound') as falas,
           bool_or(m.direction = 'outbound' and m.body ~ 'R\$ ?[0-9]') as ouviu_preco,
           bool_or(m.direction = 'outbound' and m.body ~ 'https?://') as recebeu_link
    from public.messages m
    where m.organization_id = p_org and m.created_at >= p_de
      and m.contact_id in (select id from entrada)
    group by m.contact_id
  ), venda as (
    select r.contact_id, count(*) as compras, sum(r.amount_cents) as centavos
    from public.revenue_ledger r
    where r.organization_id = p_org and r.event_type = 'charge'
      and r.contact_id in (select id from entrada)
      and not exists (
        select 1 from public.revenue_ledger e
        where e.organization_id = r.organization_id and e.external_event_id = r.external_event_id
          and e.event_type in ('refund', 'chargeback'))
    group by r.contact_id
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.leads desc), '[]'::jsonb)
  from (
    select e.anuncio,
           max(e.titulo) as titulo,
           count(*)::int as leads,
           count(*) filter (where c.falas >= 3)::int as engajaram,
           count(*) filter (where c.ouviu_preco)::int as ouviram_preco,
           count(*) filter (where c.recebeu_link)::int as receberam_link,
           count(v.contact_id)::int as compradores,
           coalesce(sum(v.compras), 0)::int as compras,
           coalesce(sum(v.centavos), 0)::bigint as receita_cents
    from entrada e
    left join conversa c on c.contact_id = e.id
    left join venda v on v.contact_id = e.id
    group by e.anuncio
  ) g;
$function$;

comment on function public.fn_resultado_por_anuncio(uuid, timestamptz, timestamptz)
  is 'Resultado por anúncio: de quem entrou no período, quantos conversaram, ouviram o preço, receberam link e compraram, e quanto renderam. Linha com anuncio nulo = contatos sem anúncio identificado. SECURITY INVOKER: quem isola a organização são as políticas das tabelas.';

revoke execute on function public.fn_resultado_por_anuncio(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.fn_resultado_por_anuncio(uuid, timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
