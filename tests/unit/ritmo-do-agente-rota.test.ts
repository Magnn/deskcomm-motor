import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PUT /api/v1/ai/agents/:id/ritmo — grava o ritmo sem apagar o resto de `config`.
 *
 * `config` guarda também preço, identidade, voz… Gravar o ritmo por cima do objeto inteiro
 * apagaria a escada de preço de um agente em produção.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const AGENTE = "11111111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => ({
  agente: null as { id: string; config: Record<string, unknown> | null; archived_at: string | null } | null,
  gravado: null as Record<string, unknown> | null,
  filtros: [] as [string, unknown][],
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG, role: "admin" } }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const leitura = {
        select: () => leitura,
        eq: (c: string, v: unknown) => {
          h.filtros.push([c, v]);
          return leitura;
        },
        maybeSingle: async () => ({ data: h.agente, error: null }),
        update: (patch: Record<string, unknown>) => {
          h.gravado = patch;
          const fim = { eq: () => fim, then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
          return fim;
        },
      };
      return leitura;
    },
  }),
}));

const ctx = { params: Promise.resolve({ id: AGENTE }) };
const put = async (corpo: unknown) => {
  const { PUT } = await import("@/app/api/v1/ai/agents/[id]/ritmo/route");
  return PUT(
    new NextRequest(`http://localhost/api/v1/ai/agents/${AGENTE}/ritmo`, {
      method: "PUT",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    ctx,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  h.gravado = null;
  h.filtros.length = 0;
  h.agente = { id: AGENTE, config: { pricing: { enabled: true, list_price_cents: 13000 }, ritmo: { modo: "rapido" } }, archived_at: null };
});

describe("PUT /api/v1/ai/agents/:id/ritmo", () => {
  it("⭐ grava o ritmo e PRESERVA o resto da configuração do agente", async () => {
    const res = await put({ modo: "natural" });

    expect(res.status).toBe(200);
    expect(h.gravado?.config).toEqual({ pricing: { enabled: true, list_price_cents: 13000 }, ritmo: { modo: "natural" } });
    expect(h.filtros).toContainEqual(["organization_id", ORG]);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.ritmo_updated", metadata: { de: "rapido", para: "natural" } }),
    );
  });

  it("modo que não existe: 422 e nada gravado", async () => {
    const res = await put({ modo: "voando" });
    expect(res.status).toBe(422);
    expect(h.gravado).toBeNull();
  });

  it("agente de outra organização (ou inexistente): 404", async () => {
    h.agente = null;
    expect((await put({ modo: "calmo" })).status).toBe(404);
    expect(h.gravado).toBeNull();
  });

  it("agente arquivado: 409", async () => {
    h.agente = { id: AGENTE, config: {}, archived_at: "2026-10-08T00:00:00Z" };
    expect((await put({ modo: "calmo" })).status).toBe(409);
  });

  it("GET devolve o modo em vigor, e o padrão quando nada foi escolhido", async () => {
    const { GET } = await import("@/app/api/v1/ai/agents/[id]/ritmo/route");
    const req = new NextRequest(`http://localhost/api/v1/ai/agents/${AGENTE}/ritmo`);
    h.agente = { id: AGENTE, config: { ritmo: { modo: "calmo" } }, archived_at: null };
    expect(((await (await GET(req, ctx)).json()) as { data: { modo: string } }).data.modo).toBe("calmo");
    h.agente = { id: AGENTE, config: null, archived_at: null };
    expect(((await (await GET(req, ctx)).json()) as { data: { modo: string } }).data.modo).toBe("rapido");
  });
});
