-- 0969 · Comentou na página do Facebook, recebe mensagem no Messenger.
--
-- O Instagram já tinha "comentou, recebe direct" (0910). Comentário em publicação
-- ou anúncio da PÁGINA do Facebook nem chegava: a página não assinava o campo
-- `feed`. Agora assina, e cada comentário novo recebe UMA resposta privada pelo
-- Messenger (a Meta aceita uma por comentário, até 7 dias depois). Quando a pessoa
-- responde, a conversa segue no canal do Messenger como qualquer outra.
--
-- `messenger_comment_replies`: um registro por comentário atendido. O índice único
-- (canal, comentário) é a trava contra a Meta reentregar o aviso e a pessoa
-- receber duas mensagens. Só o servidor lê e escreve (RLS ligada, sem policy,
-- como `instagram_comment_events`).
--
-- O texto e o liga/desliga ficam em `channel_sessions.metadata.resposta_a_comentario`.
--
-- Aditiva: tabela nova, nada a preencher.

set lock_timeout = '5s';

create table if not exists public.messenger_comment_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  comment_id text not null,
  post_id text,
  from_id text,
  comment_text text,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messenger_comment_replies_status_conhecido check (status in ('pending', 'sent', 'failed'))
);

create unique index if not exists messenger_comment_replies_comentario_uk
  on public.messenger_comment_replies (channel_session_id, comment_id);
create index if not exists messenger_comment_replies_org_idx
  on public.messenger_comment_replies (organization_id, created_at desc);

alter table public.messenger_comment_replies enable row level security;
revoke all on public.messenger_comment_replies from anon, authenticated;
grant select, insert, update, delete on public.messenger_comment_replies to service_role;

drop trigger if exists trg_messenger_comment_replies_updated_at on public.messenger_comment_replies;
create trigger trg_messenger_comment_replies_updated_at
  before update on public.messenger_comment_replies
  for each row execute function public.fn_set_updated_at();

comment on table public.messenger_comment_replies is
  'Comentário na página do Facebook respondido em privado pelo Messenger: um por comentário (índice único canal+comentário trava a reentrega da Meta). Server-side only. Migration 0969.';

reset lock_timeout;
