/**
 * AS COLUNAS QUE `lib/resultado/` LÊ EXISTEM NO BANCO.
 *
 * Os testes unitários desses módulos rodam sobre um banco em memória que aceita
 * QUALQUER nome de coluna. Foi assim que a rotina dos marcos chegou à produção
 * lendo `ai_agent_versions.config` — coluna que não existe (a configuração do
 * agente mora em `ai_agents.config`) — e falhou em toda execução, com os testes
 * verdes.
 *
 * Cada linha abaixo é o `select` de uma leitura real, contra o Postgres do
 * baseline. Coluna renomeada ou inexistente reprova aqui, antes do deploy.
 * Quem acrescentar uma leitura em `lib/resultado/` acrescenta a linha dela.
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const LEITURAS: Record<string, string> = {
  // marcos.ts
  "marcos · mensagens": "select id, organization_id, conversation_id, contact_id, direction, body, created_at, sent_at from public.messages",
  "marcos · objeções do agente publicado": "select config, published_version_id, archived_at, organization_id from public.ai_agents",
  "marcos · cursor": "select consumer, last_created_at, last_event_id, updated_at from public.watchdog_cursors",
  "marcos · gravação": "select organization_id, conversation_id, contact_id, message_id, kind, category, source, occurred_at from public.conversation_milestones",
  // receita-atribuida.ts
  "receita · ledger": "select id, organization_id, event_type, amount_cents, occurred_at, contact_id from public.revenue_ledger",
  // vendas-do-pagamento.ts (o faturamento do dashboard)
  "dashboard · vendas do gateway e estornos": "select id, event_type, amount_cents, occurred_at, contact_id, external_event_id, organization_id from public.revenue_ledger",
  "dashboard · comanda": "select id, number, contact_id, status, total_cents, created_at, attendant_user_id, notes, organization_id from public.sales",
  "receita · origem do contato": "select id, organization_id, source_metadata from public.contacts",
  "receita · conversas do contato": "select id, organization_id, contact_id from public.conversations",
  "receita · execuções do agente": "select conversation_id, agent_id, started_at, organization_id, is_dry_run, status from public.ai_agent_runs",
  "receita · nome do agente": "select id, organization_id, name from public.ai_agents",
  "receita · entradas em fluxo": "select contact_id, pointer_id, started_at, organization_id from public.followup_enrollments",
  "receita · nome do fluxo": "select id, organization_id, name from public.followup_flow_pointers",
  // funil-da-conversa.ts
  "funil · conversas": "select id, contact_id, created_at, last_inbound_at, last_outbound_at, organization_id, is_group from public.conversations",
  // motivo-da-perda.ts
  "perda · conversas paradas": "select id, contact_id, created_at, last_inbound_at, last_outbound_at, last_message_at, is_group from public.conversations",
  "perda · mensagens do pedido": "select direction, body, created_at, organization_id, conversation_id from public.messages",
  "perda · motivos": "select organization_id, conversation_id, reason, confidence, source, model, classified_at, corrected_by from public.conversation_loss_reasons",
};

describe("lib/resultado lê colunas que existem", () => {
  it.each(Object.entries(LEITURAS))("%s", (_nome, consulta) => {
    // `limit 0`: o planejador resolve os nomes sem ler linha nenhuma.
    expect(() => sql(`${consulta} limit 0;`)).not.toThrow();
  });

  it("o instrumento acusa coluna inexistente (controle negativo — foi o defeito real)", () => {
    expect(() => sql("select config from public.ai_agent_versions limit 0;")).toThrow();
  });
});
