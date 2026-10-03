-- 0914 · Motivo da perda — por que a conversa que recebeu a oferta não virou venda.
--
-- ─── O que é ────────────────────────────────────────────────────────────────
-- Uma linha por conversa parada: o MOTIVO (vocabulário fechado), a CONFIANÇA e
-- de onde veio (`source`):
--   'regra'  — fato: a pessoa não escreveu mais nada depois da oferta;
--   'ia'     — INFERÊNCIA de um modelo lendo a conversa, com a confiança dele;
--   'humano' — alguém corrigiu na tela (vence a inferência, e não é reescrito
--              por uma nova análise).
-- Fato, inferência e correção ficam separados por `source`: o painel sempre
-- sabe dizer o que foi medido e o que foi deduzido.
--
-- ─── O que NÃO guarda ───────────────────────────────────────────────────────
-- Nenhum texto da conversa nem justificativa escrita pelo modelo: um trecho
-- copiado para cá seria dado pessoal fora do alcance do apagamento (LGPD). Só o
-- rótulo e o número. Apagar a conversa apaga a linha, em cascata.
--
-- ─── Acesso ─────────────────────────────────────────────────────────────────
-- RLS ligada, ZERO policies, grants revogados de anon/authenticated: grava e lê
-- o servidor (rotas manager+), sempre escopado pela organização.

create table if not exists public.conversation_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reason text not null,
  confidence smallint,
  source text not null,
  model text,
  classified_at timestamptz not null default now(),
  corrected_by uuid references auth.users(id) on delete set null,
  constraint conversation_loss_reasons_reason_conhecido check (
    reason in ('preco', 'confianca', 'sem_urgencia', 'timing', 'concorrente', 'sem_resposta', 'outro')
  ),
  constraint conversation_loss_reasons_source_conhecida check (source in ('regra', 'ia', 'humano')),
  constraint conversation_loss_reasons_confidence_valida check (confidence is null or (confidence between 0 and 100))
);

comment on table public.conversation_loss_reasons is
  'Motivo da perda de uma conversa parada: vocabulário fechado, confiança e origem (regra = fato, ia = inferência, humano = correção). Sem texto da conversa. Uma linha por conversa. Server-only.';

create unique index if not exists conversation_loss_reasons_conversa_uk
  on public.conversation_loss_reasons (conversation_id);
create index if not exists conversation_loss_reasons_org_idx
  on public.conversation_loss_reasons (organization_id, classified_at desc);

alter table public.conversation_loss_reasons enable row level security;
revoke all on public.conversation_loss_reasons from anon, authenticated;
grant select, insert, update, delete on public.conversation_loss_reasons to service_role;

notify pgrst, 'reload schema';
