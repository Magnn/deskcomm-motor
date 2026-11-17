/**
 * Janela exigida pela organização (`settings.envio.so_dentro_da_janela`) no followup_turn: fora das 24 h,
 * nem o retorno nem o passo de envio do fluxo chamam o modelo — a saída recusaria de qualquer forma
 * (`lib/messaging/so-dentro-da-janela.ts`), e o fluxo recebe `skipped` para seguir.
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
const HORA = 3_600_000;
const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

function job(payload: Record<string, unknown>): JobRow {
  return {
    id: "job-1", organization_id: ORG, contact_id: LEAD, kind: "followup_turn", source_event_id: null,
    payload: { service_boundary: boundary, ...payload }, status: "running", priority: 0, run_after: new Date(),
    attempts: 1, max_attempts: 3, last_error: null, locked_by: "w1", locked_at: new Date(), created_at: new Date(),
  } as JobRow;
}

function fakePool(ultimaEntradaHa: number, exige = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (sql.includes("as settings"))
      return { rows: [{ ultima: new Date(Date.now() - ultimaEntradaHa * HORA), settings: exige ? { envio: { so_dentro_da_janela: true } } : {} }] };
    if (sql.includes("from messages m")) return { rows: [] };
    return { rows: [{ id: CONVERSA, channel_session_id: "canal-1", archived_at: null }] };
  });
  return { query } as never;
}

const ctx = { workerId: "w1" };
const PASSO = { followup_enrollment_id: "66666666-6666-4666-8666-666666666666", node_id: "n1", purpose: "send_message", fixed_body: "Oi" };

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;
beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

describe("followup_turn com a janela exigida pela organização", () => {
  it("⭐ passo de envio do fluxo fora da janela: devolve skipped ao fluxo, sem montar texto nem enviar", async () => {
    const complete = vi.fn(async () => undefined);
    await criarHandler({ completeFollowupTurn: complete, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as never)(job(PASSO), fakePool(25), ctx);
    expect(complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ result: expect.objectContaining({ kind: "skipped" }) }));
  });

  it("CONTROLE: dentro da janela o passo segue para o envio (não é pulado pela janela)", async () => {
    const complete = vi.fn(async () => undefined);
    await criarHandler({ completeFollowupTurn: complete } as never)(job(PASSO), fakePool(2), ctx).catch(() => undefined);
    expect(complete).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ result: expect.objectContaining({ reason: expect.stringMatching(/janela/) }) }));
  });

  it("⭐ retorno fora da janela: não chama o modelo", async () => {
    runAgentTurn.mockClear();
    await criarHandler({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as never)(job({ reason: "combinado" }), fakePool(25), ctx);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("CONTROLE: organização que não exige, retorno fora da janela segue como antes", async () => {
    runAgentTurn.mockClear();
    await criarHandler({} as never)(job({ reason: "combinado" }), fakePool(25, false), ctx);
    expect(runAgentTurn).toHaveBeenCalledTimes(1);
  });
});
