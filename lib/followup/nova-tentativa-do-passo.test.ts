/**
 * A nova tentativa do passo de IA REENVIA de fato: o evento dela ocupa a chave do passo anterior, mas não conta como
 * "envio já enfileirado" (20/10/2026: sem isto o motor só reconferia e a entrega de quem pagou nunca saía).
 */
import { describe, expect, it, vi } from "vitest";

import { avancarEnrollmentAtivo, type AdminClient, type TickDeps } from "./engine";
import type { FlowGraph } from "./graph-schema";
import type { EnrollmentEventRef, EnrollmentRow } from "./node-handlers";
import { EVENTO_NOVA_TENTATIVA } from "./sem-envio";

const NOW = new Date("2026-10-20T22:30:00.000Z");
const GRAPH: FlowGraph = {
  nodes: [
    { id: "msg-1", type: "action", label: "Entrega", position: { x: 0, y: 0 }, config: { mode: "ai_message", prompt_hint: "entregue" } },
    { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "converted" } },
  ],
  edges: [{ id: "a", source: "msg-1", target: "fim", priority: 0, condition: { type: "always" } }],
};

function enrollment(): EnrollmentRow {
  return {
    id: "enr-1", organization_id: "org-1", pointer_id: "ptr-1", version_id: "ver-1", contact_id: "contact-1",
    conversation_id: "conversa-1", current_node_id: "msg-1", status: "active", next_eval_at: NOW.toISOString(),
    claimed_until: null, attempts: 0, max_attempts: 5, last_error: null, steps_taken: 5, outcome: null,
    cancel_reason: null, started_at: NOW.toISOString(), completed_at: null, updated_at: NOW.toISOString(),
  } as EnrollmentRow;
}

function deps(eventoAnterior: EnrollmentEventRef) {
  const enqueueJob = vi.fn(async () => {});
  const db = {
    loadFlowGraph: vi.fn(async () => GRAPH),
    loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
    loadEnrollmentEvents: vi.fn(async () => [eventoAnterior]),
    loadLastInboundBody: vi.fn(async () => null),
    insertEnrollmentEvent: vi.fn(async () => ({ inserted: true })),
    updateEnrollment: vi.fn(async () => {}),
    loadFlowPointerName: vi.fn(async () => "Entrega"),
    insertDeadInboxItem: vi.fn(async () => {}),
    persistirRespostaFollowup: vi.fn(async () => {}),
  } as unknown as AdminClient;
  const d: TickDeps = { db, clock: () => NOW, enqueueJob };
  return { d, enqueueJob };
}

describe("nova tentativa do passo de IA", () => {
  it("⭐ depois da nova tentativa, o passo é enfileirado de novo", async () => {
    const { d, enqueueJob } = deps({ node_id: "msg-1", idempotency_key: "msg-1:4", event_type: EVENTO_NOVA_TENTATIVA, payload: {} });
    await avancarEnrollmentAtivo(d, enrollment());
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("controle: com o envio já enfileirado (turn_enqueued) ele NÃO enfileira de novo", async () => {
    const { d, enqueueJob } = deps({ node_id: "msg-1", idempotency_key: "msg-1:4", event_type: "turn_enqueued", payload: {} });
    await avancarEnrollmentAtivo(d, enrollment());
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
