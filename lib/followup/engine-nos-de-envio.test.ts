/**
 * O motor com os nós que agora fazem algo de verdade:
 *   - o nó Pixel reporta o evento UMA vez e, mesmo falhando, o funil segue;
 *   - o grafo é lido e validado UMA vez por instância do adaptador (por tick), não por inscrição;
 *   - PIX e Voice Studio chegam ao motor já como mensagens a enviar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { avancarEnrollmentAtivo, createSupabaseAdminClient, type AdminClient, type TickDeps } from "./engine";
import type { FlowGraph } from "./graph-schema";
import type { EnrollmentRow } from "./node-handlers";

const NOW = new Date("2026-09-30T17:00:00.000Z");
const pos = { x: 0, y: 0 };

const GRAFO_DO_PIXEL: FlowGraph = {
  nodes: [
    { id: "px", type: "meta_pixel", label: "Pixel", position: pos, config: { pixel_id: "pix-1", event_type: "Lead", page_id: "", item_value: "", currency: "BRL" } },
    { id: "fim", type: "end", label: "Fim", position: pos, config: { outcome: "converted" } },
  ],
  edges: [{ id: "e1", source: "px", target: "fim", priority: 0, condition: { type: "always" } }],
} as FlowGraph;

function inscricao(over: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "contact-1",
    conversation_id: "conv-1",
    current_node_id: "px",
    status: "active",
    next_eval_at: NOW.toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 1,
    outcome: null,
    cancel_reason: null,
    started_at: NOW.toISOString(),
    completed_at: null,
    updated_at: NOW.toISOString(),
    ...over,
  };
}

function deps(reportar: AdminClient["reportarPixelDoFluxo"]) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    loadFlowGraph: vi.fn(async () => GRAFO_DO_PIXEL),
    loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
    loadEnrollmentEvents: vi.fn(async () => []),
    loadLastInboundBody: vi.fn(async () => null),
    insertEnrollmentEvent: vi.fn(async () => ({ inserted: true })),
    updateEnrollment: vi.fn(async (_i: string, _o: string, patch: Record<string, unknown>) => void updates.push(patch)),
    loadFlowPointerName: vi.fn(async () => "Fluxo"),
    insertDeadInboxItem: vi.fn(async () => {}),
    persistirRespostaFollowup: vi.fn(async () => {}),
    reportarPixelDoFluxo: reportar,
  } as unknown as AdminClient;
  const d: TickDeps = { db, clock: () => NOW, enqueueJob: async () => {} };
  return { d, updates };
}

describe("nó Pixel no motor", () => {
  it("reporta o evento com o contexto certo e o funil avança", async () => {
    const reportar = vi.fn(async () => undefined);
    const { d, updates } = deps(reportar);
    await avancarEnrollmentAtivo(d, inscricao());

    expect(reportar).toHaveBeenCalledTimes(1);
    expect(reportar).toHaveBeenCalledWith({
      organizationId: "org-1",
      contactId: "contact-1",
      enrollmentId: "enr-1",
      nodeId: "px",
      config: expect.objectContaining({ pixel_id: "pix-1", event_type: "Lead" }),
    });
    expect(updates.some((u) => u.current_node_id === "fim" || u.status === "completed")).toBe(true);
  });

  it("falha ao reportar NUNCA trava o funil: o passo já aconteceu", async () => {
    const reportar = vi.fn(async () => {
      throw new Error("Meta fora do ar");
    });
    const { d, updates } = deps(reportar);
    await expect(avancarEnrollmentAtivo(d, inscricao())).resolves.not.toThrow();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some((u) => u.status === "dead" || u.status === "failed")).toBe(false);
  });

  it("adaptador sem a capacidade (testes, outros chamadores) simplesmente segue", async () => {
    const { d, updates } = deps(undefined);
    await avancarEnrollmentAtivo(d, inscricao());
    expect(updates.length).toBeGreaterThan(0);
  });
});

describe("carregamento do grafo: uma leitura por instância", () => {
  function supabase(graph: unknown, contar: { reads: number }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                contar.reads += 1;
                return { data: graph === null ? null : { graph }, error: null };
              },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("50 inscrições da mesma versão (o laço do tick) leem e validam o grafo UMA vez", async () => {
    const c = { reads: 0 };
    const db = createSupabaseAdminClient(supabase(GRAFO_DO_PIXEL, c));
    const vistos = new Set<unknown>();
    for (let i = 0; i < 50; i++) vistos.add(await db.loadFlowGraph("org-1", "ver-1"));
    expect(c.reads).toBe(1);
    expect(vistos.size).toBe(1);
  });

  it("versões diferentes não se misturam, e organizações também não", async () => {
    const c = { reads: 0 };
    const db = createSupabaseAdminClient(supabase(GRAFO_DO_PIXEL, c));
    await db.loadFlowGraph("org-1", "ver-1");
    await db.loadFlowGraph("org-1", "ver-2");
    await db.loadFlowGraph("org-2", "ver-1");
    expect(c.reads).toBe(3);
  });

  it("versão ausente NÃO é cacheada: ela pode aparecer no próximo claim", async () => {
    const c = { reads: 0 };
    const db = createSupabaseAdminClient(supabase(null, c));
    expect(await db.loadFlowGraph("org-1", "ver-1")).toBeNull();
    expect(await db.loadFlowGraph("org-1", "ver-1")).toBeNull();
    expect(c.reads).toBe(2);
  });

  it("o motor recebe PIX e Voice Studio já como Ação de conteúdo", async () => {
    const grafo = {
      nodes: [
        { id: "pix", type: "pix_payment", label: "PIX", position: pos, config: { key_type: "cpf", pix_key: "123", amount: "10,00" } },
        { id: "voz", type: "voice_studio", label: "Voz", position: pos, config: { text: "Oi", voice_id: "julieta" } },
      ],
      edges: [],
    };
    const db = createSupabaseAdminClient(supabase(grafo, { reads: 0 }));
    const g = await db.loadFlowGraph("org-1", "ver-1");
    expect(g?.nodes.map((n) => n.type)).toEqual(["action", "action"]);
  });
});
