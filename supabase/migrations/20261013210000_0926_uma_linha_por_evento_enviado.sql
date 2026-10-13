-- 0926 — uma linha por EVENTO enviado à plataforma de anúncio, não por negócio.
--
-- A chave de `ad_conversion_dispatches` era (organização, negócio, evento): um negócio só podia ter UMA compra
-- reportada. A compra avulsa (um extra pago por quem já comprou o produto) é outra compra do mesmo negócio e não
-- tinha onde ser registrada. A chave passa a incluir o id do evento; `nulls not distinct` mantém uma linha só
-- para quem grava sem id.
--
-- Idempotente e portável: deduplica pela chave nova antes de criar o índice.
delete from public.ad_conversion_dispatches a
  using public.ad_conversion_dispatches b
 where a.organization_id = b.organization_id
   and a.lead_id = b.lead_id
   and a.event_name = b.event_name
   and a.event_id is not distinct from b.event_id
   and a.attempted_at < b.attempted_at;

drop index if exists public.ad_conversion_dispatches_lead_event_uk;
create unique index if not exists ad_conversion_dispatches_evento_uk
  on public.ad_conversion_dispatches (organization_id, lead_id, event_name, event_id) nulls not distinct;
