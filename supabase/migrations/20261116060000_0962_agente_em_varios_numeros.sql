-- 0962 — UM AGENTE EM VÁRIOS NÚMEROS
--
-- O agente atendia UM número (`ai_agent_versions.channel_session_id`). Quem
-- tinha três números com o mesmo atendimento precisava de três cópias do
-- agente, e uma mudança no roteiro valia só para a cópia editada (medido em
-- 16/11/2026: quatro "Cigana Esmeralda" com o mesmo prompt).
--
-- Esta tabela lista os números que o agente TAMBÉM atende. O número da versão
-- publicada continua sendo o principal, e um agente sem linha aqui funciona
-- exatamente como antes. Vale na hora, sem publicar versão, como as abas do
-- agente: é onde ele atende, não o que ele diz.
--
-- Tabela de vínculo, e não array: a FK composta `(organization_id,
-- channel_session_id)` recusa número de outra organização no banco (padrão da
-- 0377).

create table if not exists public.ai_agent_numeros (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  channel_session_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (agent_id, channel_session_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_agent_numeros_sessao_org_fk') then
    alter table public.ai_agent_numeros
      add constraint ai_agent_numeros_sessao_org_fk
      foreign key (organization_id, channel_session_id)
      references public.channel_sessions (organization_id, id)
      on delete cascade;
  end if;
end $$;

-- A pergunta do turno: "quem atende este número?".
create index if not exists idx_ai_agent_numeros_sessao
  on public.ai_agent_numeros (organization_id, channel_session_id);

comment on table public.ai_agent_numeros is
  'Números que o agente atende além do principal (ai_agent_versions.channel_session_id da versão publicada). Vale na hora, sem publicar versão (migration 0962).';

-- RLS no padrão da 0377: leitura para quem é da organização; escrita só pelo servidor (a rota exige admin).
alter table public.ai_agent_numeros enable row level security;

drop policy if exists ai_agent_numeros_select on public.ai_agent_numeros;
create policy ai_agent_numeros_select on public.ai_agent_numeros
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

revoke all on public.ai_agent_numeros from anon, authenticated;
grant select on public.ai_agent_numeros to authenticated;
