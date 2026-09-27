/**
 * Um brief de anúncio individual — PUT (substitui) e DELETE (apaga de verdade).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";
const BRIEF = "44444444-4444-4444-8444-444444444444";

interface BriefRow {
  id: string;
  organization_id: string;
  agent_id: string;
  rotulo: string;
  ad_id: string | null;
  titulo_contem: string | null;
  nivel: string | null;
  desejo_ou_dor: string | null;
  medo_oculto: string | null;
  promessa: string | null;
  ativo: boolean;
}

interface Estado {
  briefs: BriefRow[];
}

function acha(estado: Estado, filtros: Array<[string, unknown]>): BriefRow | undefined {
  return estado.briefs.find((b) => filtros.every(([c, v]) => (b as never)[c] === v));
}

function stubAdmin(estado: Estado) {
  return {
    from: (table: string) => {
      if (table !== "ai_agent_ad_briefs") throw new Error(`tabela inesperada: ${table}`);
      return {
        update: (payload: Record<string, unknown>) => {
          const filtros: Array<[string, unknown]> = [];
          const chain = {
            eq: (c: string, v: unknown) => {
              filtros.push([c, v]);
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                const existente = acha(estado, filtros);
                if (!existente) return { data: null, error: null };
                const outroAtivoComMesmoAdId =
                  payload.ad_id !== undefined &&
                  payload.ativo !== false &&
                  estado.briefs.some(
                    (b) => b.id !== existente.id && b.agent_id === existente.agent_id && b.ativo && b.ad_id === payload.ad_id,
                  );
                if (outroAtivoComMesmoAdId) return { data: null, error: { code: "23505", message: "duplicate key" } };
                Object.assign(existente, payload);
                return { data: existente, error: null };
              },
            }),
          };
          return chain;
        },
        delete: () => {
          const filtros: Array<[string, unknown]> = [];
          const chain = {
            eq: (c: string, v: unknown) => {
              filtros.push([c, v]);
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                const existente = acha(estado, filtros);
                if (!existente) return { data: null, error: null };
                estado.briefs = estado.briefs.filter((b) => b.id !== existente.id);
                return { data: { id: existente.id }, error: null };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
}

function comoPapel(papel: Role) {
  const user: AuthUser = {
    id: USER,
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : ({ ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }) } as never),
  );
}

const put = (corpo: unknown) =>
  new NextRequest("http://localhost/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
const ctx = { params: Promise.resolve({ id: AGENT, briefId: BRIEF }) };

const EXISTENTE: BriefRow = {
  id: BRIEF,
  organization_id: ORG,
  agent_id: AGENT,
  rotulo: "Original",
  ad_id: "120211",
  titulo_contem: null,
  nivel: "sabe_do_problema",
  desejo_ou_dor: null,
  medo_oculto: null,
  promessa: null,
  ativo: true,
};

let estado: Estado;
beforeEach(() => {
  estado = { briefs: [{ ...EXISTENTE }] };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  comoPapel("admin");
});

describe("PUT /ai/agents/:id/ad-briefs/:briefId", () => {
  it("substitui o brief e audita o formato", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ rotulo: "Novo nome", ad_id: "120211", nivel: "conhece_a_oferta", ativo: false }), ctx);
    expect(res.status).toBe(200);
    expect(estado.briefs[0]?.rotulo).toBe("Novo nome");
    expect(estado.briefs[0]?.ativo).toBe(false);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.ad_brief_updated");
  });

  it("só admin edita: manager recebe 403", async () => {
    comoPapel("manager");
    const { PUT } = await import("./route");
    const res = await PUT(put({ rotulo: "X", ad_id: "1" }), ctx);
    expect(res.status).toBe(403);
    expect(estado.briefs[0]?.rotulo).toBe("Original");
  });

  it("brief que não existe (ou é de outro agente/organização) é 404", async () => {
    const res = await (
      await import("./route")
    ).PUT(put({ rotulo: "X", ad_id: "1" }), { params: Promise.resolve({ id: AGENT, briefId: "00000000-0000-4000-8000-000000000000" }) });
    expect(res.status).toBe(404);
  });

  it("corpo inválido (sem rótulo) é 422, sem gravar", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ ad_id: "1" }), ctx);
    expect(res.status).toBe(422);
    expect(estado.briefs[0]?.rotulo).toBe("Original");
  });
});

describe("DELETE /ai/agents/:id/ad-briefs/:briefId", () => {
  it("apaga de verdade — some da lista, não vira 'arquivado'", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(estado.briefs).toHaveLength(0);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.ad_brief_deleted");
  });

  it("só admin apaga: manager recebe 403 e o brief continua lá", async () => {
    comoPapel("manager");
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
    expect(estado.briefs).toHaveLength(1);
  });

  it("brief que não existe é 404", async () => {
    const res = await (
      await import("./route")
    ).DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: AGENT, briefId: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });
});
