/**
 * A Pergunta no engine (não só no handler): a resposta vai para o campo do lead, e saída solta
 * PARA o lead sem erro, sem relógio e sem cancelá-lo. Mesmo harness de `engine-match-reply-inbound`.
 */
import { describe, expect, it, vi } from "vitest";

import { avancarEnrollmentAtivo, type AdminClient, type TickDeps } from "./engine";
import type { FlowGraph } from "./graph-schema";
import type { EnrollmentEventRef, EnrollmentRow } from "./node-handlers";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const ENVIADA = "2026-09-30T11:00:00.000Z";

const grafo = (config: Record<string, unknown>, edges: FlowGraph["edges"]): FlowGraph =>
  ({
    nodes: [
      { id: "p1", type: "collect", label: "Pergunta", position: { x: 0, y: 0 }, config: { key: "cidade", label: "Cidade?", type: "text", required: true, permite_correcao: true, ...config } },
      { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
    ],
    edges,
  }) as unknown as FlowGraph;

const enrollment = (): EnrollmentRow => ({
  id: "enr-1",
  organization_id: "org-1",
  pointer_id: "ptr-1",
  version_id: "ver-1",
  contact_id: "c-1",
  conversation_id: null,
  current_node_id: "p1",
  status: "waiting_reply",
  next_eval_at: NOW.toISOString(),
  claimed_until: null,
  attempts: 0,
  max_attempts: 5,
  last_error: null,
  steps_taken: 4,
  outcome: null,
  cancel_reason: null,
  started_at: ENVIADA,
  completed_at: null,
  updated_at: NOW.toISOString(),
});

// A pergunta saiu (collect_sent): o passo atual é 4, então a ocupação anterior (3) tem o evento.
const EVENTOS: EnrollmentEventRef[] = [
  { node_id: "p1", idempotency_key: "p1:3", event_type: "collect_sent", payload: { next_eval_at: "2026-09-30T13:00:00.000Z" } },
];

function montar(graph: FlowGraph, resposta: string | null) {
  const passos: Array<Record<string, unknown>> = [];
  const eventos: Array<{ event_type: string; payload: Record<string, unknown> }> = [];
  const persistidos: Array<Record<string, unknown>> = [];
  const db = {
    loadFlowGraph: vi.fn(async () => graph),
    loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [], custom_fields: {} })),
    loadEnrollmentEvents: vi.fn(async () => EVENTOS),
    loadLastInboundBody: vi.fn(async () => resposta),
    loadFlowPointerName: vi.fn(async () => null),
    insertEnrollmentEvent: vi.fn(async (e: { event_type: string; payload: Record<string, unknown> }) => {
      eventos.push({ event_type: e.event_type, payload: e.payload });
      return { inserted: true };
    }),
    updateEnrollment: vi.fn(async (_id: string, _org: string, patch: Record<string, unknown>) => {
      passos.push(patch);
    }),
    persistirRespostaFollowup: vi.fn(async (input: Record<string, unknown>) => {
      persistidos.push(input);
    }),
  } as unknown as AdminClient;
  const deps: TickDeps = { db, clock: () => NOW, enqueueJob: async () => {} };
  return { deps, passos, eventos, persistidos };
}

describe("engine — Pergunta", () => {
  it("a resposta vai para o campo do lead e o fluxo segue por «Respondeu»", async () => {
    const g = grafo({}, [{ id: "e", source: "p1", target: "fim", priority: 0, condition: { type: "always" } } as never]);
    const { deps, passos, persistidos } = montar(g, "São Paulo");
    await avancarEnrollmentAtivo(deps, enrollment());
    expect(persistidos).toEqual([
      expect.objectContaining({ contact_id: "c-1", save_to: { kind: "lead_custom", key: "cidade" }, value: "São Paulo" }),
    ]);
    expect(passos.some((p) => p.current_node_id === "fim")).toBe(true);
  });

  it("salvar_resposta_campo=false: segue, mas NÃO grava no cadastro", async () => {
    const g = grafo({ salvar_resposta_campo: false }, [{ id: "e", source: "p1", target: "fim", priority: 0, condition: { type: "always" } } as never]);
    const { deps, passos, persistidos } = montar(g, "São Paulo");
    await avancarEnrollmentAtivo(deps, enrollment());
    expect(persistidos).toEqual([]);
    expect(passos.some((p) => p.current_node_id === "fim")).toBe(true);
  });

  // ⚠️ Estes dois casos cobravam `status active/waiting_reply` com `next_eval_at: null` — um estado que o
  // banco RECUSA (CHECK `followup_enrollments_relogio_coerente`). O dublê daqui aceitava; a produção não:
  // a inscrição ficava presa em erro. O que se cobra agora cabe no banco.
  it("«Respondeu» solta: o fluxo TERMINA nesta caixa (sem erro), com o motivo, e o que ele disse não se perde", async () => {
    const g = grafo({}, []);
    const { deps, passos, eventos, persistidos } = montar(g, "São Paulo");
    await avancarEnrollmentAtivo(deps, enrollment());
    expect(eventos.map((e) => e.event_type)).toContain("node_parked");
    expect(eventos.find((e) => e.event_type === "node_parked")!.payload.reason).toContain("Respondeu");
    const parou = passos.find((p) => p.next_eval_at === null);
    expect(parou).toMatchObject({ current_node_id: "p1", status: "completed", outcome: "exhausted", next_eval_at: null });
    expect(String(parou!.cancel_reason)).toContain("Respondeu");
    expect(persistidos).toHaveLength(1);
  });

  it("prazo vencido com «Sem resposta» solta: para, mas segue OUVINDO (waiting_reply) para a resposta tardia", async () => {
    const g = grafo({ expiracao_tempo: 1 }, [{ id: "e", source: "p1", target: "fim", priority: 0, condition: { type: "always" } } as never]);
    // Sem resposta (null) e o prazo já passou (next_eval_at vencido + wait elapsed pelo evento da etapa anterior).
    const { deps, passos, eventos } = montar(g, null);
    await avancarEnrollmentAtivo(deps, { ...enrollment(), status: "waiting_reply" });
    expect(eventos.map((e) => e.event_type)).toContain("node_parked");
    const ouvindo = passos.find((p) => p.status === "waiting_reply");
    expect(ouvindo).toMatchObject({ current_node_id: "p1", status: "waiting_reply" });
    // Ouvindo COM relógio — sem ele o banco recusa a linha.
    expect(typeof ouvindo!.next_eval_at).toBe("string");
    expect(Date.parse(String(ouvindo!.next_eval_at))).toBeGreaterThan(Date.now());
  });
});
