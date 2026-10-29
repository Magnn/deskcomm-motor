/**
 * Um retorno do agente por vez.
 *
 * Retornos adiados pelo limite diário do número saem todos na mesma abertura, um atrás do outro
 * (a fila só serializa por contato). Medido em 29/10/2026: uma cliente que não comprou recebeu
 * três "como tá o seu coração?" às 07:10, 07:13 e 07:16 (os três marcados para 07:00). O handler agora
 * descarta o retorno quando o agente já falou depois da hora marcada e o cliente não escreveu desde então.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as InboundTurnModule from "@/lib/agent-engine/agent/inbound-turn";
import type { JobRow } from "@/lib/agent-engine/queue/queue";

const runAgentTurn = vi.fn(async () => undefined);

vi.mock("@/lib/agent-engine/agent/inbound-turn", async (original) => {
  const real = await original<typeof InboundTurnModule>();
  return { ...real, runAgentTurn };
});

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const CANAL = "canal-1";

const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

function job(payload: Record<string, unknown> = {}): JobRow {
  return {
    id: "job-2",
    organization_id: ORG,
    contact_id: LEAD,
    kind: "followup_turn",
    source_event_id: null,
    payload: { service_boundary: boundary, ...payload },
    status: "running",
    priority: 0,
    run_after: new Date(),
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    locked_by: "w1",
    locked_at: new Date(),
    created_at: new Date(),
  } as JobRow;
}

/** `jaFalou`: o agente falou depois da hora marcada, sem o cliente escrever. */
function fakePool(jaFalou: boolean) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (sql.includes("from messages m")) return { rows: jaFalou ? [{ "?column?": 1 }] : [] };
    return { rows: [{ id: CONVERSA, channel_session_id: CANAL, archived_at: null }] };
  });
  return { pool: { query } as never, consultas };
}

const ctx = { workerId: "w1" };

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;

beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

describe("followup_turn — um retorno do agente por vez", () => {
  it("⭐ o agente já falou depois da hora marcada e o cliente não respondeu: não chama o modelo nem envia", async () => {
    runAgentTurn.mockClear();
    const { pool } = fakePool(true);
    const info = vi.fn();

    await criarHandler({ log: { info, warn: vi.fn(), error: vi.fn() } } as never)(
      job({ reason: "Envio não pôde sair hoje (limite diário do número)" }),
      pool,
      ctx,
    );

    expect(runAgentTurn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/retorno do agente descartado/), expect.objectContaining({ job_id: "job-2" }));
  });

  it("o agente não falou desde a hora marcada: o turno acontece", async () => {
    runAgentTurn.mockClear();
    const { pool, consultas } = fakePool(false);

    const j = job({ reason: "pagamento combinado" });
    await criarHandler({} as never)(j, pool, ctx);

    expect(runAgentTurn).toHaveBeenCalledTimes(1);
    const trava = consultas.find((c) => c.sql.includes("from messages m"));
    // A consulta olha a MESMA conversa, a partir da hora em que ESTE job estava marcado.
    expect(trava?.params).toEqual([ORG, CONVERSA, j.run_after]);
    expect(trava?.sql).toMatch(/sent_via = 'ai'/);
    expect(trava?.sql).toMatch(/direction = 'inbound'/);
  });

  it("passo de fluxo não passa pela trava (o fluxo tem o próprio ritmo)", async () => {
    runAgentTurn.mockClear();
    const { pool, consultas } = fakePool(true);

    // Sem completeFollowupTurn o turno de fluxo falha mais adiante; o que importa é a trava não ter rodado.
    await criarHandler({} as never)(job({ followup_enrollment_id: "enr-1", node_id: "n1", purpose: "send_message" }), pool, ctx).catch(() => undefined);

    expect(consultas.some((c) => c.sql.includes("from messages m"))).toBe(false);
  });
});
