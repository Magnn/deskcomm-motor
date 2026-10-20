/**
 * O fluxo que termina devolve a vez para a agente — medido em 20/10/2026: a resposta que encerrava o fluxo ficava sem
 * ninguém (o turno da agente tinha sido pulado enquanto o fluxo estava no comando).
 */
import { describe, expect, it, vi } from "vitest";

import { SQL_DEVOLVER_A_VEZ } from "./devolver-a-vez";
import { avancarEnrollmentAtivo, type AdminClient, type TickDeps } from "./engine";
import type { FlowGraph } from "./graph-schema";
import type { EnrollmentRow } from "./node-handlers";

const NOW = new Date("2026-10-20T19:00:00.000Z");

const GRAPH: FlowGraph = {
  nodes: [{ id: "fim", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "custom" } }],
  edges: [],
};

function enrollment(): EnrollmentRow {
  return {
    id: "enr-1", organization_id: "org-1", pointer_id: "ptr-1", version_id: "ver-1", contact_id: "contact-1",
    conversation_id: "conversation-1", current_node_id: "fim", status: "active", next_eval_at: NOW.toISOString(),
    claimed_until: null, attempts: 0, max_attempts: 5, last_error: null, steps_taken: 3, outcome: null,
    cancel_reason: null, started_at: NOW.toISOString(), completed_at: null, updated_at: NOW.toISOString(),
  } as EnrollmentRow;
}

function fake(inserted: boolean) {
  const devolverAVezAoAgente = vi.fn(async () => {});
  const db = {
    loadFlowGraph: vi.fn(async () => GRAPH),
    loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
    loadEnrollmentEvents: vi.fn(async () => (inserted ? [] : [{ node_id: "fim", idempotency_key: "fim:3", event_type: "completed", payload: {} }])),
    loadLastInboundBody: vi.fn(async () => null),
    insertEnrollmentEvent: vi.fn(async () => ({ inserted })),
    updateEnrollment: vi.fn(async () => {}),
    loadFlowPointerName: vi.fn(async () => "Fluxo"),
    insertDeadInboxItem: vi.fn(async () => {}),
    persistirRespostaFollowup: vi.fn(async () => {}),
    devolverAVezAoAgente,
  } as unknown as AdminClient;
  const deps: TickDeps = { db, clock: () => NOW, enqueueJob: async () => {} };
  return { deps, devolverAVezAoAgente };
}

describe("o fluxo devolve a vez quando termina", () => {
  it("⭐ inscrição que chega ao Fim acorda a agente para o contato", async () => {
    const f = fake(true);
    await avancarEnrollmentAtivo(f.deps, enrollment());
    expect(f.devolverAVezAoAgente).toHaveBeenCalledWith("org-1", "contact-1");
  });

  it("o mesmo passo reaplicado (replay) não acorda de novo", async () => {
    const f = fake(false);
    await avancarEnrollmentAtivo(f.deps, enrollment());
    expect(f.devolverAVezAoAgente).not.toHaveBeenCalled();
  });

  it("⭐ só devolve quando a última mensagem é da pessoa e é recente — a última palavra nossa não acorda ninguém", () => {
    expect(SQL_DEVOLVER_A_VEZ).toContain("where u.direction = 'inbound'");
    expect(SQL_DEVOLVER_A_VEZ).toContain("interval '30 minutes'");
    expect(SQL_DEVOLVER_A_VEZ).toContain("'ai_agent.dispatch_requested'");
    expect(SQL_DEVOLVER_A_VEZ).toContain("'inbound_message_id', u.id");
  });
});
