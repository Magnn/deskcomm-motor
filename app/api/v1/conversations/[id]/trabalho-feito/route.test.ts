/**
 * A rota do "Trabalho feito" — a prova de execução confirmada por uma pessoa, avisada pelo agente.
 *
 * O que ela precisa garantir:
 *   1. a conversa é procurada NA organização da sessão;
 *   2. fora da janela de 24 h (ou sem mensagem dela) nada é enfileirado, e a tela recebe o motivo;
 *   3. o mesmo aviso não é pedido duas vezes em 6 h;
 *   4. o job leva o motivo, a conversa e `so_dentro_da_janela`, e a auditoria não leva o texto da observação.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { readCurrentServiceBoundary } from "@/lib/atendimento/fronteira-server";
import { enqueueJob } from "@/lib/agent-engine/queue/queue";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

const consulta = vi.fn();
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({ query: consulta }) }));
vi.mock("@/lib/agent-engine/queue/queue", () => ({ enqueueJob: vi.fn(async () => ({ job: {}, deduped: false })) }));
vi.mock("@/lib/atendimento/fronteira-server", () => ({ readCurrentServiceBoundary: vi.fn() }));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CONV = "33333333-3333-4333-8333-333333333333";
const CONTATO = "44444444-4444-4444-8444-444444444444";
const HORA = 3_600_000;

const filtros: Array<[string, unknown]> = [];
function conversa(linha: { id: string; contact_id: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return chain;
        },
        maybeSingle: async () => ({ data: linha, error: null }),
      };
      return chain;
    },
  } as never);
}
const banco = (ultimaDela: Date | null, ultimoAviso: Date | null = null) =>
  consulta.mockResolvedValue({ rows: [{ ultima_dela: ultimaDela, ultimo_aviso: ultimoAviso }] });

const pedido = (corpo: unknown = {}) =>
  POST(new NextRequest(`http://x/api/v1/conversations/${CONV}/trabalho-feito`, { method: "POST", body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ id: CONV }),
  });

beforeEach(() => {
  filtros.length = 0;
  vi.mocked(audit).mockClear();
  vi.mocked(enqueueJob).mockClear();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: USER, idioma: "pt-BR" }, org: { orgId: ORG } } as never);
  vi.mocked(readCurrentServiceBoundary).mockResolvedValue({
    organization_id: ORG,
    contact_id: CONTATO,
    conversation_id: CONV,
    service_revision: 3,
    demanda_id: null,
    demanda_revision: null,
  } as never);
  conversa({ id: CONV, contact_id: CONTATO });
  banco(new Date(Date.now() - 2 * HORA));
});

describe("POST /conversations/[id]/trabalho-feito", () => {
  it("⭐ dentro da janela: acorda o agente com o motivo, a conversa e a trava da janela; audita sem o texto", async () => {
    const res = await pedido({ observacao: "acendemos às 21h" });

    expect(res.status).toBe(200);
    expect(filtros).toContainEqual(["organization_id", ORG]);
    const [, org, job] = vi.mocked(enqueueJob).mock.calls[0]!;
    expect(org).toBe(ORG);
    expect(job).toMatchObject({ leadId: CONTATO, kind: "followup_turn" });
    const payload = job.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ conversation_id: CONV, so_dentro_da_janela: true, trabalho_feito: { por: USER } });
    expect(payload.reason).toMatch(/acendemos às 21h/);
    expect(payload.reason).toMatch(/Não prometa resultado/);
    const linha = vi.mocked(audit).mock.calls[0]![0];
    expect(linha).toMatchObject({ action: "service.work_done_confirmed", resourceId: CONV, metadata: { com_observacao: true } });
    expect(JSON.stringify(linha)).not.toMatch(/21h/);
  });

  it("fora da janela de 24 h: não enfileira e diz por quê", async () => {
    banco(new Date(Date.now() - 25 * HORA));
    const res = await pedido();
    expect(res.status).toBe(409);
    expect((await res.json()).error.details).toEqual({ motivo: "fora_da_janela" });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("aviso pedido há menos de 6 h não sai de novo", async () => {
    banco(new Date(Date.now() - HORA), new Date(Date.now() - 2 * HORA));
    const res = await pedido();
    expect(res.status).toBe(409);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("conversa de outra organização (não encontrada) não toca a fila", async () => {
    conversa(null);
    const res = await pedido();
    expect(res.status).toBe(404);
    expect(consulta).not.toHaveBeenCalledWith(expect.anything(), [ORG, null, expect.anything()]);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("observação acima de 300 caracteres é recusada antes de ler o banco", async () => {
    const res = await pedido({ observacao: "x".repeat(301) });
    expect(res.status).toBe(422);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
