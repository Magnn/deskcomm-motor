-- O LEDGER FINANCEIRO IMUTÁVEL — fato de receita, não decisão.
--
-- ─── Por que esta tabela e não uma das que já existem ───────────────────────
--
-- O módulo financeiro (0350-0359) já tem `financial_entries`: lançamento
-- contábil interno da COMANDA (`sales`), preso a `financial_accounts` (Caixa,
-- Banco) e `payment_methods` que a organização precisa configurar antes de
-- vender. Uma compra que chega pelo webhook da Cakto (`lib/webhooks/cakto.ts`,
-- `lib/pagamentos/compra-cakto.ts`) não passa pela comanda — é venda de
-- produto digital, direto do link de pagamento pro WhatsApp, sem caixa, sem
-- forma de pagamento cadastrada na tela. Forçar `financial_entries.account_id
-- not null` faria toda organização que só vende assim primeiro cadastrar uma
-- conta e um plano que não representam nada da operação dela — e
-- `financial_entries` também não é append-only no nível certo: RLS permite
-- UPDATE/DELETE a partir de `manager` (só o TRIGGER trava depois de `paid_at`),
-- que é mutabilidade demais para um registro de auditoria/compliance.
--
-- Hoje a idempotência do webhook da Cakto é uma TAG no contato
-- (`compra:<pedido>` em `contacts.tags`) — checada por leitura, não por
-- constraint: duas entregas concorrentes do mesmo aviso correm risco de
-- corrida. E não existe NENHUM registro estruturado, por evento, do que
-- entrou/saiu (charge/refund/chargeback) — só o `ultima_compra` (um jsonb que
-- o próximo evento sobrescreve) e o log genérico `webhook_events_log` (grava
-- toda ENTREGA do webhook, inclusive reentregas — não é um livro de fatos
-- deduplicado, é o log de recebimento).
--
-- Este é o recorte que sobra depois do DIRC:
--   Duplicar   — não. `financial_entries`/`sales` continuam sendo o livro da
--                comanda; este é o livro do que vem de FORA (gateway de
--                pagamento), e as duas coisas divergem estruturalmente.
--   Integrar   — não há tabela para herdar de FK: o fato é novo.
--   Referenciar — sim: `contact_id`/`webhook_source_id` são PONTEIROS
--                opcionais para quem já existe, não cópia.
--   Calcular   — não: é o fato bruto, não um total.
--
-- ─── O que ESTA migration explicitamente NÃO traz do NEXUS ──────────────────
--
-- O Revenue Graph do NEXUS (`apps/nexus/REVENUE_GRAPH_SPEC.md`) modela Order,
-- Opportunity, Checkout, Visitor, Touchpoint, IdentityLink, AttributionRun e
-- DuplicateSuspicion/RevenueEventExclusion — um grafo comercial inteiro para
-- responder "de onde veio a venda". Nada disso entra aqui. Trazido é só o
-- equivalente a `RevenueEvent`: um fato de receita imutável, com dedupe. Sem
-- Order (o "pedido" já existe na Cakto — `external_event_id` é o ponteiro pra
-- ele, não uma entidade nossa), sem atribuição, sem `decide()`, sem NENHUMA
-- regra "se N eventos então X" — isso é escopo do NEXUS Decision Engine, que a
-- decisão já tomada com o dono do produto descarta para este repo.
--
-- ─── Os quatro tipos, e por que só três têm origem hoje ─────────────────────
--
-- `charge` (compra aprovada), `refund` (reembolso) e `chargeback` já têm
-- evento correspondente no webhook da Cakto e ganham uma linha a partir desta
-- migration (`lib/pagamentos/ledger-de-receita.ts`). `adjustment` (ajuste
-- manual, ex.: correção de reconciliação) existe no VOCABULÁRIO porque o
-- pedido explicitamente lista os quatro — mas nenhum caminho desta migration
-- escreve nele: não há tela nem rota que crie um ajuste. Fica pronto para
-- quando existir (mesma régua de `financial_entries.origin = 'manual'`, que
-- também nasceu sem produtor no dia 1).
--
-- ─── Apêndice idempotente no baseline.sql: OBRIGATÓRIO (ver CLAUDE.md) ──────

create table if not exists public.revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- O fato. `text` + CHECK (não enum — doutrina da casa): lista fechada hoje,
  -- alargável por migration nova quando um provedor mandar taxa (`fee`) de
  -- verdade — não especulado agora (YAGNI: NEXUS lista `fee` no domínio dele,
  -- nenhuma fonte deste repo emite isso hoje).
  event_type text not null check (event_type in ('charge', 'refund', 'chargeback', 'adjustment')),

  -- SEMPRE magnitude, exceto `adjustment` (pode corrigir para mais ou para
  -- menos) — mesma regra do RevenueEvent do NEXUS (Seção 6 do
  -- REVENUE_GRAPH_SPEC.md). Nunca zero: um ajuste de valor zero não é fato.
  amount_cents bigint not null,
  currency text not null default 'BRL' check (char_length(currency) = 3),
  constraint revenue_ledger_valor_por_tipo check (
    (event_type = 'adjustment' and amount_cents <> 0)
    or (event_type <> 'adjustment' and amount_cents > 0)
  ),

  -- De onde veio. `provider` fechado (só 'cakto' hoje) pelo mesmo motivo do
  -- `event_type`: alarga por migration quando a segunda integração chegar
  -- (Hotmart/Kiwify, cotados no catálogo Fase 1). `webhook_source_id` é o
  -- equivalente, NESTE repo, ao `providerAccountId` do domínio do NEXUS — a
  -- linha de `webhook_sources` já é "qual conta/endpoint desta organização" e
  -- não precisa de uma segunda coluna dizendo a mesma coisa (DIRC: referenciar,
  -- não duplicar). Nullable: um `adjustment` manual futuro não nasce de webhook.
  provider text not null check (provider in ('cakto')),
  webhook_source_id uuid references public.webhook_sources(id) on delete set null,

  -- A chave de dedupe. `external_event_id` é o `data.id` (ou `refId`) que a
  -- Cakto manda — o mesmo valor que hoje vira a tag `compra:<pedido>` em
  -- `contacts.tags`, agora com garantia de BANCO em vez de leitura-antes-de-
  -- escrever. `external_ref_id` é informativo (o `refId` quando `id` também
  -- veio) — não entra na chave.
  external_event_id text not null,
  external_ref_id text,

  -- Quando o fato aconteceu de verdade (ex.: `paidAt` da Cakto) vs. quando
  -- ESTE banco soube. Cakto às vezes não manda `paidAt` em refund/chargeback —
  -- `occurred_at` cai para o default (momento do INSERT) nesse caso; é uma
  -- aproximação documentada, não um valor inventado como se fosse exato.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- O contra-fato que este evento reverte/ajusta (refund→charge,
  -- chargeback→charge, adjustment→qualquer um). Opcional: a Cakto nem sempre
  -- correlaciona, e recusar o INSERT por falta desse ponteiro perderia o fato
  -- em vez de registrá-lo incompleto.
  related_event_id uuid references public.revenue_ledger(id) on delete set null,

  -- Identidade RESOLVIDA no momento do evento — ponteiro, nunca cópia de nome/
  -- e-mail/telefone (a tabela não guarda PII nenhuma; é por isso que ela não
  -- entra na cascata LGPD de `fn_lgpd_cascade_redact_contact`, mesmo
  -- argumento que já vale para `sale_items.description` na 0359: FK para
  -- `contacts` sem nenhuma coluna de dado pessoal ao lado). `set null`: a
  -- pessoa pode ser reidentificada/mesclada depois, o fato financeiro fica.
  contact_id uuid references public.contacts(id) on delete set null,

  -- Descritivo, não estrutural: nome do produto/oferta, cupom, forma de
  -- pagamento em texto. Nunca nome/e-mail/telefone do cliente — a identidade
  -- mora em `contact_id`. Lido só para exibição em relatório, nunca filtrado
  -- por path (não é o "jsonb lock-in" que o CLAUDE.md proíbe).
  metadata jsonb not null default '{}'::jsonb,

  created_by_user_id uuid references auth.users(id) on delete set null
);

-- Dedupe de verdade: a MESMA reentrega do MESMO webhook, para o MESMO tipo de
-- fato, não cria segunda linha — captura `code === '23505'` no app, doutrina
-- já usada no resto do repo (`crm_leads.uniq_crm_leads_org_source_external`,
-- `loyalty_ledger_idem_key`). O tipo entra na chave de propósito: um
-- `purchase_approved` e o `refund` que vem depois para o MESMO `data.id` são
-- dois fatos diferentes sobre o mesmo pedido, não a mesma notificação
-- reenviada — sem o tipo na chave, o refund seria bloqueado como "duplicata"
-- do charge.
create unique index if not exists revenue_ledger_dedupe_key
  on public.revenue_ledger (organization_id, provider, event_type, external_event_id);

create index if not exists revenue_ledger_org_data_idx
  on public.revenue_ledger (organization_id, occurred_at desc);
create index if not exists revenue_ledger_contato_idx
  on public.revenue_ledger (organization_id, contact_id)
  where contact_id is not null;
create index if not exists revenue_ledger_related_idx
  on public.revenue_ledger (related_event_id)
  where related_event_id is not null;

-- ─── RLS: leitura para quem é da organização, ESCRITA NENHUMA por PostgREST ──
--
-- Mesma régua de "leitura para quem é da organização" que o resto do módulo
-- financeiro já usa (0350) — quem vê caixa não precisa ser manager, só ser da
-- casa. A diferença proposital é a ESCRITA: não existe policy de INSERT/
-- UPDATE/DELETE para `anon`/`authenticated` NENHUMA — nem restrita a
-- `manager`. O único escritor é o webhook, pelo admin client (`service_role`),
-- com `organization_id` resolvido da fonte confiável do path_token (nunca do
-- corpo) — doutrina de handler com admin client do CLAUDE.md. Não existe hoje
-- rota nem tela que grave aqui a partir de uma sessão de usuário; se um dia
-- existir um ajuste manual pela tela, ele ganha sua PRÓPRIA policy de INSERT
-- restrita a `manager`+ naquele momento — não antes, e não por especulação.
alter table public.revenue_ledger enable row level security;

drop policy if exists tenant_isolation_revenue_ledger_select on public.revenue_ledger;
create policy tenant_isolation_revenue_ledger_select
  on public.revenue_ledger
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

-- ─── Append-only nos DOIS níveis — RLS decide, mas o GRANT é a cerca real ────
--
-- O mesmo problema que a 0258 mediu no Supabase real: todo projeto nasce com
-- um default ACL de TABELAS que dá UPDATE/DELETE/TRUNCATE (e INSERT) a
-- `anon`/`authenticated`/`service_role`, e o `service_role` IGNORA RLS — a
-- ausência de policy de escrita acima não o impede. Sem este bloco, a service
-- key (que o webhook já usa) poderia apagar ou reescrever um fato financeiro
-- direto pela REST, o pior desenho possível para uma peça de auditoria.
--
-- `service_role` mantém INSERT (é como o webhook grava) e SELECT; perde
-- UPDATE/DELETE/TRUNCATE — igual à 0258, ele SEGUE sendo o único apagamento
-- possível é não existir nenhum (não há função de expurgo aqui: fato
-- financeiro não tem política de retenção que o apague, diferente do audit
-- log operacional). `anon`/`authenticated` perdem tudo que não é SELECT: nem
-- RLS nem GRANT autorizam escrita alguma a partir de uma sessão de usuário.
revoke all on table public.revenue_ledger from anon;
revoke insert, update, delete, truncate on table public.revenue_ledger from authenticated;
revoke update, delete, truncate on table public.revenue_ledger from service_role;

grant select on table public.revenue_ledger to authenticated;
grant select, insert on table public.revenue_ledger to service_role;

comment on table public.revenue_ledger is
  'Ledger financeiro imutável (equivalente ao RevenueEvent do NEXUS Revenue Graph, sem nenhuma peça de decisão). Fato de receita bruto por evento de gateway externo (charge/refund/chargeback/adjustment), dedupe por (organization_id, provider, event_type, external_event_id). Append-only: anon/authenticated/service_role sem UPDATE/DELETE/TRUNCATE (migration 0401, mesmo padrão de api_audit_log/0258) — só o dono do banco pode. Escrito hoje só pelo webhook da Cakto (lib/pagamentos/ledger-de-receita.ts); NÃO tem regra de decisão nenhuma, só reconciliação e relatório.';

notify pgrst, 'reload schema';
