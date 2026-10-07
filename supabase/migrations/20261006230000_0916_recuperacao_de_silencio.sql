-- 0916 · Recuperação de silêncio — o registro de cada chamada que o agente fez a quem parou de responder.
--
-- ─── O que é ────────────────────────────────────────────────────────────────
-- Uma linha por chamada. A CHAVE é a mensagem do cliente que abriu o silêncio
-- (`anchor_message_id`): enquanto ela for a última mensagem recebida, o agente
-- está no mesmo silêncio; quando o cliente escreve de novo, a âncora muda e a
-- contagem recomeça sozinha.
--
--   kind 'step'        — chamada N da régua configurada no agente (3 min, 15 min, 3 h…).
--   kind 'keep_window' — a mensagem que mantém a conversa aberta até a data
--                        combinada, uma por prazo de 24 h (step = 0).
--
-- `silence_since` é o instante da última fala do agente ANTES da primeira
-- chamada: é dele que os passos são contados. Sem guardar, a própria chamada
-- (que também é uma fala do agente) empurraria o relógio para a frente.
--
-- ─── Por que tabela, e não a fila ───────────────────────────────────────────
-- O índice único é o que garante "uma vez por passo" com dois workers no ar:
-- quem perde o insert não enfileira.
--
-- ─── O que NÃO guarda ───────────────────────────────────────────────────────
-- Nenhum texto. Apagar a conversa apaga as linhas, em cascata.
--
-- ─── Acesso ─────────────────────────────────────────────────────────────────
-- RLS ligada, ZERO policies, grants revogados de anon/authenticated: só o
-- servidor (worker) lê e grava, sempre escopado pela organização.

create table if not exists public.silence_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null,
  anchor_message_id uuid not null,
  kind text not null,
  step smallint not null default 0,
  silence_since timestamptz not null,
  created_at timestamptz not null default now(),
  constraint silence_recovery_attempts_kind_conhecido check (kind in ('step', 'keep_window')),
  constraint silence_recovery_attempts_step_valido check (step between 0 and 20)
);

comment on table public.silence_recovery_attempts is
  'Chamadas de recuperação feitas pelo agente a quem parou de responder: uma linha por (conversa, mensagem-âncora, tipo, passo). Sem texto. Server-only. Espelhado em lib/agent-engine/edge/crm/recuperacao-por-silencio.ts.';

create unique index if not exists silence_recovery_attempts_uma_por_passo
  on public.silence_recovery_attempts (conversation_id, anchor_message_id, kind, step);
create index if not exists silence_recovery_attempts_org_idx
  on public.silence_recovery_attempts (organization_id, created_at desc);

alter table public.silence_recovery_attempts enable row level security;
revoke all on public.silence_recovery_attempts from anon, authenticated;
grant select, insert, update, delete on public.silence_recovery_attempts to service_role;

notify pgrst, 'reload schema';
