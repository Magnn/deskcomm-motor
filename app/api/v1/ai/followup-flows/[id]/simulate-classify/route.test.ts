/**
 * A rota é a ÚNICA parte do Simulador que chama IA de verdade (ver cabeçalho
 * de route.ts) — o que este teste fixa é o contrato dela: entra texto +
 * classes do nó, sai a classe; sem `followup_flow_pointers` da org, 404 antes
 * de gastar um token; classificador que falha vira 422 legível, não 500 cru.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  classify: vi.fn(),
  requestDeps: vi.fn(),
  pool: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/agent-engine/agent/followup-flow-classify", () => ({ classifyFollowupReply: deps.classify }));
vi.mock("@/lib/agent-engine/agent/request-deps", () => ({ requestTurnDeps: deps.requestDeps }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: deps.pool }));

import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function stubAdmin(pointerExists: boolean) {
  const busca = {
    select: () => busca,
    eq: () => busca,
    maybeSingle: async () => ({ data: pointerExists ? { id: ID } : null, error: null }),
  };
  return { from: () => busca };
}

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/ai/followup-flows/${ID}/simulate-classify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({
    ok: true,
    user: { id: "eu", idioma: "pt-BR" },
    org: { orgId: ORG, role: "manager" },
  });
  deps.admin.mockReturnValue(stubAdmin(true));
  deps.requestDeps.mockReturnValue({ llmCfg: {}, log: {}, registry: undefined });
  deps.pool.mockReturnValue({ query: vi.fn() });
});

describe("POST /api/v1/ai/followup-flows/[id]/simulate-classify", () => {
  it("classifica com o classificador real e devolve a classe", async () => {
    deps.classify.mockResolvedValue("Interessado");

    const res = await POST(
      req({ candidate_text: "quero sim", classes: ["Interessado", "Sem interesse"] }),
      { params: Promise.resolve({ id: ID }) },
    );
    const body = (await res.json()) as { data: { class: string } };

    expect(res.status).toBe(200);
    expect(body.data.class).toBe("Interessado");
    expect(deps.classify).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tenantId: ORG, leadId: null }),
      expect.objectContaining({ candidateText: "quero sim", classes: ["Interessado", "Sem interesse"] }),
      expect.anything(),
    );
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "followup_flow.simulated", organizationId: ORG }),
    );
  });

  it("fluxo de outra organização (ou inexistente): 404 antes de chamar o classificador", async () => {
    deps.admin.mockReturnValue(stubAdmin(false));

    const res = await POST(req({ candidate_text: "oi", classes: ["a", "b"] }), {
      params: Promise.resolve({ id: ID }),
    });

    expect(res.status).toBe(404);
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it("body inválido (sem classes): 422 de validação, sem chamar o classificador", async () => {
    const res = await POST(req({ candidate_text: "oi", classes: [] }), {
      params: Promise.resolve({ id: ID }),
    });

    expect(res.status).toBe(422);
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it("classificador falha (saída sem classe reconhecível): 422 legível, nunca 500 cru", async () => {
    deps.classify.mockRejectedValue(new Error("saída do modelo sem classe reconhecível"));

    const res = await POST(
      req({ candidate_text: "???", classes: ["a", "b"] }),
      { params: Promise.resolve({ id: ID }) },
    );
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("simulate_classify_failed");
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("papel abaixo de manager é recusado antes de tocar o banco", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    const res = await POST(req({ candidate_text: "oi", classes: ["a"] }), {
      params: Promise.resolve({ id: ID }),
    });

    expect(res.status).toBe(403);
    expect(deps.admin).not.toHaveBeenCalled();
    expect(deps.classify).not.toHaveBeenCalled();
  });
});
