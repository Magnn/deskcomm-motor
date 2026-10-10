-- ============================================================================
-- 0921 — A PROPOSTA DO FLYWHEEL PODE SER DISPENSADA E DESFEITA
--
-- Uma proposta só tinha dois estados: pendente e aplicada. Faltavam as duas saídas:
--
--   - DISPENSAR. Numa instalação medida em 10/10/2026 havia 92 propostas pendentes, 90 delas
--     dizendo a mesma frase; a única forma de limpar a lista era apagar linha no banco.
--   - DESFAZER. Aplicar publicava uma versão nova do agente e não guardava qual estava no ar:
--     se a mudança piorasse o atendimento, voltar dependia de alguém achar a versão certa no
--     histórico. `previous_version_id` guarda essa versão no momento da aplicação.
--
-- Só colunas novas, todas nulas: nenhuma linha existente muda de estado.
-- ============================================================================

alter table public.flywheel_distiller_proposals
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid,
  add column if not exists previous_version_id uuid references public.ai_agent_versions(id) on delete set null,
  add column if not exists reverted_at timestamptz,
  add column if not exists reverted_by uuid;

comment on column public.flywheel_distiller_proposals.previous_version_id
  is 'A versão do agente que estava publicada quando a proposta foi aplicada: é para ela que o desfazer volta.';

-- A lista da tela pede as pendentes da organização, da mais nova para a mais antiga.
create index if not exists idx_flywheel_propostas_pendentes
  on public.flywheel_distiller_proposals (organization_id, proposed_at desc)
  where applied_at is null and dismissed_at is null;

notify pgrst, 'reload schema';
