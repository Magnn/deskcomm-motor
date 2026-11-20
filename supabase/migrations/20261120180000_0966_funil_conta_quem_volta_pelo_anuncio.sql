-- ============================================================================
-- 0966 — O FUNIL POR ANÚNCIO CONTA QUEM VEIO PELO BOTÃO E QUEM VOLTOU PELO ANÚNCIO
--
-- Medido em 20/11/2026, com 29 contatos novos no dia:
--   · os 29 caíam na linha "sem anúncio identificado". Quem chega pelo botão da página grava as UTMs
--     do clique no contato, e o id do anúncio fica em `utm_content` ({{ad.id}}); a função só lia `ad_id`,
--     que só o clique do anúncio direto para o WhatsApp grava;
--   · quem já era contato e voltou por um anúncio não entrava: a coorte era só de contatos CRIADOS no
--     período. O Gerenciador marcava 29 leads; o nosso número tinha de ser igual ou maior, e não era.
-- Agora o anúncio é `ad_id` ou o `utm_content` numérico, e a coorte soma quem teve clique do botão
-- casado no período (`meta_ads_click_refs.matched_at`), pelo anúncio desse clique, uma vez por pessoa.
-- Com os dados do dia: 33 leads em 5 anúncios, nenhum sem anúncio.
--
-- `meta_ads_click_refs` é do servidor (sem grant a `authenticated`), e a função é SECURITY INVOKER:
-- a execução fica só com `service_role` — o único chamador é a rota `/api/v1/ads/resultado-por-anuncio`,
-- que usa o cliente de servidor. Idempotente (`create or replace`).
-- ============================================================================

set local lock_timeout = '5s';

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
  -- A COORTE é de quem ENTROU no período pelo anúncio, e cada pessoa conta UMA vez:
  --   · contato novo no período, pelo anúncio do primeiro toque. O id do anúncio é `ad_id` (clique do anúncio
  --     para o WhatsApp) ou, para quem veio pelo botão da página, o `utm_content` numérico ({{ad.id}});
  --   · quem JÁ era contato e voltou por um clique do botão casado no período, pelo anúncio desse clique.
  -- A compra conta mesmo que tenha acontecido depois do fim do período.
  with novos as (
    select c.id,
           coalesce(
             nullif(c.source_metadata->>'ad_id', ''),
             case when c.source_metadata->>'utm_content' ~ '^[0-9]{6,}$' then c.source_metadata->>'utm_content' end
           ) as anuncio,
           nullif(c.source_metadata->>'ad_title', '') as titulo
    from public.contacts c
    where c.organization_id = p_org and c.created_at >= p_de and c.created_at <= p_ate
  ), voltaram as (
    select distinct on (r.contact_id)
           r.contact_id as id,
           case when r.utm->>'utm_content' ~ '^[0-9]{6,}$' then r.utm->>'utm_content' end as anuncio,
           null::text as titulo
    from public.meta_ads_click_refs r
    where r.organization_id = p_org and r.matched_at >= p_de and r.matched_at <= p_ate
      and r.contact_id is not null
      and not exists (select 1 from novos n where n.id = r.contact_id)
    order by r.contact_id, r.matched_at
  ), entrada as (
    select id, anuncio, titulo from novos
    union all
    select id, anuncio, titulo from voltaram
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
  is 'Resultado por anúncio: de quem entrou no período (contato novo, ou quem já era contato e voltou por clique do botão casado no período), quantos conversaram, ouviram o preço, receberam link e compraram, e quanto renderam. Anúncio = ad_id ou utm_content numérico. Linha com anuncio nulo = sem anúncio identificado. SECURITY INVOKER; só o servidor executa (lê meta_ads_click_refs, que é do servidor).';

revoke execute on function public.fn_resultado_por_anuncio(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.fn_resultado_por_anuncio(uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
