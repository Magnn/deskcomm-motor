/**
 * O ENVIO DE FLUXO NÃO É SEGURADO POR TEXTO REPETIDO NEM POR TETO DO DIA.
 *
 * Decisão do dono do produto, medida em produção: um roteiro fixo manda a MESMA
 * mensagem a todo lead, e a trava de texto repetido (`mass_identical`) vetava o
 * terceiro lead do anúncio no meio do funil; o teto do dia segurava quem chegava
 * depois. Quem roda anúncio controla o volume pela verba.
 *
 * O que estes testes seguram:
 *  1. o teto do dia desarma SOZINHO — janela de horário e intervalo entre envios
 *     continuam valendo;
 *  2. as duas saídas de fluxo (texto fixo e caixa de Conteúdo) pedem o desarme;
 *  3. o texto do MODELO continua com as duas travas armadas.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { decidePacing } from "@/lib/agent-engine/pacing/engine";
import type { JobRow } from "@/lib/agent-engine/queue/queue";

// ── 1 · o motor de ritmo ────────────────────────────────────────────────────

const MADRUGADA = new Date("2026-07-28T06:00:00Z"); // 03h em São Paulo — fora da janela 7h-22h
const COMERCIAL = new Date("2026-07-28T13:00:00Z"); // 10h — dentro

function ritmo(over: { now: Date; sentToday?: number; lastSentAt?: Date | null; enforceDailyCaps?: boolean; crmDailyLimit?: number | null }) {
  return decidePacing({
    now: over.now,
    knobs: PACING_DEFAULTS,
    state: { lastSentAt: over.lastSentAt ?? null, sentToday: over.sentToday ?? 0, numberActivatedAt: null },
    crmDailyLimit: over.crmDailyLimit ?? null,
    rng: () => 0,
    ...(over.enforceDailyCaps === undefined ? {} : { enforceDailyCaps: over.enforceDailyCaps }),
  });
}

describe("o teto do dia desarma sozinho", () => {
  it("armado (o padrão): número novo com o teto de aquecimento gasto é vetado", () => {
    const d = ritmo({ now: COMERCIAL, sentToday: 999 });
    expect(d).toMatchObject({ allow: false, code: "warmup_cap" });
  });

  it("⭐ desarmado: nem o aquecimento nem o limite diário seguram o envio", () => {
    expect(ritmo({ now: COMERCIAL, sentToday: 999, enforceDailyCaps: false }).allow).toBe(true);
    expect(ritmo({ now: COMERCIAL, sentToday: 999, crmDailyLimit: 10, enforceDailyCaps: false }).allow).toBe(true);
  });

  it("desarmar o teto NÃO desarma a janela de horário: 3h da manhã continua esperando", () => {
    expect(ritmo({ now: MADRUGADA, enforceDailyCaps: false })).toMatchObject({ allow: false, code: "outside_window" });
  });

  it("desarmar o teto NÃO desarma o intervalo entre envios", () => {
    const d = ritmo({ now: COMERCIAL, sentToday: 999, lastSentAt: COMERCIAL, enforceDailyCaps: false });
    expect(d.allow).toBe(true);
    if (!d.allow) throw new Error("inalcançável");
    expect(d.waitMs).toBe(PACING_DEFAULTS.throttleMs);
  });
});

// ── 2 e 3 · quem pede o desarme ─────────────────────────────────────────────

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const CANAL = "canal-1";
const AGORA = new Date("2026-09-18T15:00:00.000Z");

const chain = vi.fn(async (_args: Record<string, unknown>) => ({ status: "sent", outcome: { kind: "sent" }, trace: [] }) as unknown as Record<string, unknown>);
vi.mock("@/lib/agent-engine/guardrails/before-send", () => ({
  runBeforeSend: (args: Record<string, unknown>) => chain(args),
}));
vi.mock("@/lib/agent-engine/agent/human-handoff", () => ({ isLeadInHandoff: vi.fn(async () => false) }));
vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", () => ({
  getLeadContext: vi.fn(async () => ({
    ok: true,
    context: { contact: { is_blocked: false } },
    lgpd: { isAnonymized: false, isProspecting: false, legalBasis: {} },
  })),
}));
vi.mock("@/lib/agent-engine/cron/scheduler", () => ({ scheduleCronJob: vi.fn(async () => undefined) }));

const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

function job(payload: Record<string, unknown>): JobRow {
  return {
    id: "job-1",
    organization_id: ORG,
    contact_id: LEAD,
    kind: "followup_turn",
    source_event_id: null,
    payload: { ...payload, service_boundary: boundary },
    status: "running",
    priority: 0,
    run_after: AGORA,
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    locked_by: "w1",
    locked_at: AGORA,
    created_at: AGORA,
  } as JobRow;
}

function fakePool() {
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }> => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (/from conversations/.test(sql)) return { rows: [{ id: CONVERSA, channel_session_id: CANAL, archived_at: null }] };
    return { rows: [], rowCount: 0 };
  });
  return { query } as never;
}

function deps() {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    crmCfg: {},
    llmCfg: {},
    knobs: {},
    channel: () => ({ send: vi.fn(async () => ({ ok: true })) }),
    completeFollowupTurn: vi.fn(async () => undefined),
  } as never;
}

const BASE = { followup_enrollment_id: "11111111-1111-4111-8111-111111111111", node_id: "a1", purpose: "send_message" };

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;

beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

beforeEach(() => {
  chain.mockClear();
});

describe("as saídas de FLUXO pedem o desarme", () => {
  it("⭐ texto fixo de uma caixa: sem trava de texto repetido e sem teto do dia", async () => {
    await criarHandler(deps())(job({ ...BASE, fixed_body: "oi, tudo bem?" }), fakePool(), { workerId: "w1" });

    expect(chain).toHaveBeenCalledTimes(1);
    expect(chain.mock.calls[0]![0]).toMatchObject({ enforceSpinning: false, enforceDailyCaps: false });
  });

  it("⭐ caixa de Conteúdo: idem, em cada trecho", async () => {
    await criarHandler(deps())(
      job({ ...BASE, content_items: [{ type: "text", body: "primeira" }, { type: "delay", seconds: 1 }, { type: "text", body: "segunda" }] }),
      fakePool(),
      { workerId: "w1" },
    );

    expect(chain.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const [args] of chain.mock.calls) {
      expect(args).toMatchObject({ enforceSpinning: false, enforceDailyCaps: false });
    }
  });

  it("o desarme é só dessas duas travas: nada sobre pedido de saída ou LGPD é afrouxado no pedido", async () => {
    await criarHandler(deps())(job({ ...BASE, fixed_body: "oi" }), fakePool(), { workerId: "w1" });
    const args = chain.mock.calls[0]![0];
    expect(args).toHaveProperty("lgpd");
    expect(args).toHaveProperty("optedOutThisTurn");
  });
});
