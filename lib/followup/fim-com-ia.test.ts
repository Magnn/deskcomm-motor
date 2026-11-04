/**
 * O Fim com «Ao finalizar: IA» pede o turno da agente — medido em 04/11/2026 no funil CIGANA TAROT: quem parava de
 * responder recebia o lembrete, a inscrição esgotava e ninguém mais falava com a pessoa.
 */
import { describe, expect, it, vi } from "vitest";

const enqueueJob = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => "job-1"));

vi.mock("@/lib/atendimento/fronteira-server", () => ({
  readCurrentServiceBoundary: vi.fn(async () => ({
    organization_id: "org-1", contact_id: "contact-1", conversation_id: "conversation-1",
    service_revision: 4, demanda_id: null, demanda_revision: null,
  })),
}));
vi.mock("@/lib/agent-engine/queue/queue", () => ({ enqueueJob }));

import { avancarEnrollmentAtivo, type AdminClient, type TickDeps } from "./engine";
import { instrucaoDoFimComIa, pedidoDeFimComIa, pedirTurnoDoFimComIa, podePedirTurnoDoFim } from "./fim-com-ia";
import type { FlowGraph, FlowNode } from "./graph-schema";
import type { EnrollmentRow } from "./node-handlers";

const NOW = new Date("2026-11-04T16:00:00.000Z");
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);

function fimNode(aoFinalizar?: unknown): FlowNode {
  return {
    id: "fim", type: "end", label: "Fim", position: { x: 0, y: 0 },
    config: { outcome: "custom", ...(aoFinalizar ? { ao_finalizar: aoFinalizar } : {}) },
  } as FlowNode;
}

function enrollment(): EnrollmentRow {
  return {
    id: "enr-1", organization_id: "org-1", pointer_id: "ptr-1", version_id: "ver-1", contact_id: "contact-1",
    conversation_id: "conversation-1", current_node_id: "fim", status: "active", next_eval_at: NOW.toISOString(),
    claimed_until: null, attempts: 0, max_attempts: 5, last_error: null, steps_taken: 3, outcome: null,
    cancel_reason: null, started_at: NOW.toISOString(), completed_at: null, updated_at: NOW.toISOString(),
  } as EnrollmentRow;
}

describe("pedido do Fim com IA", () => {
  it("⭐ só o Fim com «IA» que concluiu gera pedido, com a instrução da caixa", () => {
    const p = pedidoDeFimComIa(enrollment(), fimNode({ tipo: "ia", prompt: "  Retome pela data  " }), { kind: "complete" } as never);
    expect(p).toMatchObject({ enrollmentId: "enr-1", nodeId: "fim", conversationId: "conversation-1", instrucao: "Retome pela data" });
    expect(pedidoDeFimComIa(enrollment(), fimNode({ tipo: "nada" }), { kind: "complete" } as never)).toBeNull();
    expect(pedidoDeFimComIa(enrollment(), fimNode(), { kind: "complete" } as never)).toBeNull();
  });

  it("caixa sem texto usa a instrução padrão", () => {
    expect(instrucaoDoFimComIa("   ")).toContain("parou de responder");
    expect(instrucaoDoFimComIa(undefined)).toContain("parou de responder");
  });
});

describe("quando pedir o turno", () => {
  it("⭐ a última palavra é nossa e ela escreveu há pouco: pede", () => {
    expect(podePedirTurnoDoFim(NOW, { direcao: "outbound", quando: min(10) }, min(60))).toBeNull();
  });
  it("a última palavra é dela e recente: quem responde é devolver-a-vez", () => {
    expect(podePedirTurnoDoFim(NOW, { direcao: "inbound", quando: min(5) }, min(5))).toBe("ultima_palavra_dela");
  });
  it("⭐ fora da janela de 24 h nada sai", () => {
    expect(podePedirTurnoDoFim(NOW, { direcao: "outbound", quando: min(10) }, min(25 * 60))).toBe("fora_da_janela");
  });
  it("sem mensagem dela, nada sai", () => {
    expect(podePedirTurnoDoFim(NOW, { direcao: "outbound", quando: min(10) }, null)).toBe("sem_mensagem_dela");
  });
});

describe("pedirTurnoDoFimComIa", () => {
  const pedido = {
    organizationId: "org-1", contactId: "contact-1", conversationId: "conversation-1",
    enrollmentId: "enr-1", nodeId: "fim", instrucao: "Retome",
  };

  function db(jaPedido: boolean, conversa: Record<string, unknown> | null) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from job_queue")) return { rows: jaPedido ? [{ x: 1 }] : [] };
      return { rows: conversa ? [conversa] : [] };
    });
    return { query } as never;
  }

  it("⭐ enfileira o followup_turn só dentro da janela, marcado com a inscrição", async () => {
    enqueueJob.mockClear();
    const r = await pedirTurnoDoFimComIa(
      db(false, { conversation_id: "conversation-1", direction: "outbound", quando: min(10), ultima_dela: min(60) }), pedido, NOW,
    );
    expect(r).toBe("pedido");
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const [, org, job] = enqueueJob.mock.calls[0] as unknown as [unknown, string, { kind: string; payload: Record<string, unknown> }];
    expect(org).toBe("org-1");
    expect(job.kind).toBe("followup_turn");
    expect(job.payload).toMatchObject({
      reason: "Retome", so_dentro_da_janela: true, conversation_id: "conversation-1",
      fim_do_fluxo: { enrollment_id: "enr-1", node_id: "fim" },
    });
  });

  it("o mesmo Fim não pede duas vezes", async () => {
    enqueueJob.mockClear();
    expect(await pedirTurnoDoFimComIa(db(true, null), pedido, NOW)).toBe("ja_pedido");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("fora da janela não enfileira", async () => {
    enqueueJob.mockClear();
    const r = await pedirTurnoDoFimComIa(
      db(false, { conversation_id: "conversation-1", direction: "outbound", quando: min(10), ultima_dela: min(30 * 60) }), pedido, NOW,
    );
    expect(r).toBe("fora_da_janela");
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

describe("o motor chama o pedido ao concluir no Fim com IA", () => {
  function fake(inserted: boolean, aoFinalizar: unknown) {
    const graph: FlowGraph = { nodes: [fimNode(aoFinalizar)], edges: [] };
    const pedir = vi.fn(async () => "pedido");
    const db = {
      loadFlowGraph: vi.fn(async () => graph),
      loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
      loadEnrollmentEvents: vi.fn(async () =>
        inserted ? [] : [{ node_id: "fim", idempotency_key: "fim:3", event_type: "completed", payload: {} }]),
      loadLastInboundBody: vi.fn(async () => null),
      insertEnrollmentEvent: vi.fn(async () => ({ inserted })),
      updateEnrollment: vi.fn(async () => {}),
      loadFlowPointerName: vi.fn(async () => "Fluxo"),
      insertDeadInboxItem: vi.fn(async () => {}),
      persistirRespostaFollowup: vi.fn(async () => {}),
      devolverAVezAoAgente: vi.fn(async () => {}),
      pedirTurnoDoFimComIa: pedir,
    } as unknown as AdminClient;
    const deps: TickDeps = { db, clock: () => NOW, enqueueJob: async () => {} };
    return { deps, pedir };
  }

  it("⭐ Fim com IA pede o turno", async () => {
    const f = fake(true, { tipo: "ia", prompt: "Retome" });
    await avancarEnrollmentAtivo(f.deps, enrollment());
    expect(f.pedir).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: "enr-1", instrucao: "Retome" }));
  });
  it("Fim sem IA não pede", async () => {
    const f = fake(true, { tipo: "nada" });
    await avancarEnrollmentAtivo(f.deps, enrollment());
    expect(f.pedir).not.toHaveBeenCalled();
  });
  it("replay não pede de novo", async () => {
    const f = fake(false, { tipo: "ia" });
    await avancarEnrollmentAtivo(f.deps, enrollment());
    expect(f.pedir).not.toHaveBeenCalled();
  });
});
