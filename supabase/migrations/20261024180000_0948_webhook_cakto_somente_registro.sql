-- 0948 · A FONTE DA CAKTO "SÓ REGISTRO": a venda de uma página de vendas que não é do atendimento.
--
-- Pedido do dono em 24/10/2026: as páginas das mandalas mostram o aviso "Fulana acabou de adquirir" com as
-- vendas REAIS. Para isso a venda da página precisa chegar ao Desk — mas pela fonte da Cakto de hoje ela
-- procuraria o contato pelo telefone/e-mail, marcaria `pago` e inscreveria no fluxo de entrega do
-- atendimento: a cliente do WhatsApp que comprasse as mandalas receberia a entrega de outro produto.
--
-- `cakto_somente_registro = true`: o aviso é gravado (`webhook_events_log`) e vira receita
-- (`revenue_ledger`), e nada mais — nenhum contato, tag ou fluxo. É também a ÚNICA fonte cujas compras a
-- rota pública `compras-recentes` mostra (primeiro nome e hora).
--
-- Aditiva: coluna nova com padrão `false`, então toda fonte existente continua exatamente como era.

alter table public.webhook_sources
  add column if not exists cakto_somente_registro boolean not null default false;

comment on column public.webhook_sources.cakto_somente_registro is
  'Aviso da Cakto só é registrado (arquivo + receita), sem contato/tag/fluxo; e só estas fontes aparecem no aviso público de compras recentes (0948).';
