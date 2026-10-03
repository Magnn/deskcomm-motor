-- 0913 · Marcos da conversa — o FATO de que uma oferta foi apresentada ou uma
-- objeção apareceu, numa mensagem específica.
--
-- ─── Para que serve ─────────────────────────────────────────────────────────
-- O funil da conversa ("recebeu → respondeu → viu a oferta → objetou →
-- comprou") e "onde a conversa para" precisam saber EM QUE MENSAGEM a oferta foi
-- dita e a objeção apareceu. Nada gravava isso: o preço dito e a reclamação de
-- valor eram reconhecidos na hora do envio (guarda de promessa, estado da
-- negociação) e esquecidos em seguida.
--
-- ─── O que é, e o que NÃO é ─────────────────────────────────────────────────
-- FATO reconhecido por REGRA (`fonte = 'regra'`): o preço dito numa mensagem que
-- saiu, a reclamação de valor ou a frase de objeção cadastrada pelo dono numa
-- mensagem que chegou. Não é inferência de modelo — quando houver (motivo da
-- perda por IA), entra com outra `fonte`, ao lado, sem reescrever este.
--
-- Um marco por mensagem e tipo (índice único): a rotina que classifica pode
-- passar duas vezes pela mesma mensagem sem duplicar nada.
--
-- ─── Acesso ─────────────────────────────────────────────────────────────────
-- RLS ligada, ZERO policies, grants revogados de anon/authenticated: quem grava
-- é a rotina do servidor e quem lê é a rota da tela (manager+), sempre pelo
-- servidor e escopada pela organização. O texto da mensagem NÃO é copiado aqui
-- (LGPD: apagar a mensagem apaga o marco, em cascata).

create table if not exists public.conversation_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  message_id uuid not null references public.messages(id) on delete cascade,
  kind text not null,
  category text,
  source text not null default 'regra',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint conversation_milestones_kind_conhecido check (kind in ('oferta_apresentada', 'objecao')),
  constraint conversation_milestones_source_conhecida check (source in ('regra')),
  constraint conversation_milestones_category_curta check (category is null or char_length(category) <= 120)
);

comment on table public.conversation_milestones is
  'Marcos da conversa reconhecidos por regra: oferta apresentada (preço dito numa mensagem que saiu) e objeção (reclamação de valor ou frase cadastrada na aba Objeções, numa mensagem que chegou). Um por mensagem e tipo. Server-only.';

create unique index if not exists conversation_milestones_mensagem_tipo_uk
  on public.conversation_milestones (message_id, kind);
create index if not exists conversation_milestones_org_tipo_idx
  on public.conversation_milestones (organization_id, kind, occurred_at desc);
create index if not exists conversation_milestones_conversa_idx
  on public.conversation_milestones (conversation_id, occurred_at);

alter table public.conversation_milestones enable row level security;
revoke all on public.conversation_milestones from anon, authenticated;
grant select, insert, update, delete on public.conversation_milestones to service_role;

notify pgrst, 'reload schema';
