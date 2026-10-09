-- 0918 · Cinco índices para consultas que varriam a tabela inteira a cada execução.
--
-- ─── O que foi medido (produção, 09/10/2026) ────────────────────────────────
-- Com 21 mil linhas em `job_queue` (20,9 mil `done`), 138 mil em `event_log` e 62 mil em
-- `messages`, o banco rodava a 200% de CPU com a aplicação quase parada. Em 45 segundos:
-- `job_queue` sofreu 1.205 varreduras sequenciais (25 milhões de linhas lidas).
--
-- 1. A recuperação de silêncio pergunta, para CADA conversa candidata, se o contato tem tarefa
--    viva (`not exists (select 1 from job_queue q where q.organization_id = … and
--    q.contact_id = … and q.status in ('pending','running'))`). Nenhum índice de `job_queue`
--    começa por contato com esses dois estados — o único por contato cobre só `running`. Uma
--    execução lia 1,5 milhão de blocos e levava 2 segundos, a cada tick.
-- 2. O resgate de eventos órfãos (`event_log` com `status = 'processing'` e `updated_at`
--    antigo), do drain e do dispatcher, varria os 126 MB da tabela para achar zero linhas.
-- 3. A conferência de reenvio (`messages` por `metadata->>'idempotency_key'`) lia ~4,8 mil
--    blocos por chamada.
-- 4. A soma de custo do turno (`llm_calls` por `job_id`) e a contagem de envios aceitos por
--    contato (`send_ledger`) varriam a tabela a cada turno: 15 e 9 varreduras em 45 s.
--
-- ─── Por que índice parcial ─────────────────────────────────────────────────
-- Na fila e na chave de reenvio, a pergunta é sobre uma fração mínima da tabela (tarefa viva,
-- mensagem com chave). O índice parcial tem o tamanho dessa fração e não cresce
-- com o histórico, que é o que cresce.
--
-- ─── Sem CONCURRENTLY ───────────────────────────────────────────────────────
-- O runner envolve a migration em transação, e `create index concurrently` não roda em
-- transação. Nas tabelas medidas a criação leva menos de um segundo.

create index if not exists idx_job_queue_vivo_por_contato
  on public.job_queue (organization_id, contact_id)
  where status in ('pending', 'running');

-- Sem `where`: quem pergunta é o PostgREST, com o estado como PARÂMETRO, e o plano genérico não
-- consegue provar o predicado de um índice parcial (medido: com o parcial criado, a varredura
-- continuou). O índice comum serve às duas formas.
create index if not exists idx_event_log_estado_e_atualizacao
  on public.event_log (status, updated_at);

create index if not exists idx_llm_calls_por_tarefa
  on public.llm_calls (job_id);

create index if not exists idx_send_ledger_por_contato_e_estado
  on public.send_ledger (organization_id, contact_id, status);

create index if not exists idx_messages_chave_de_idempotencia
  on public.messages (organization_id, (metadata->>'idempotency_key'))
  where (metadata->>'idempotency_key') is not null;
