/**
 * A lista de briefs de anúncio de um agente — GET (lê) e POST (cria).
 *
 * O que precisa garantir (a tela sozinha não garante — quem chama a API pode não ser a tela):
 *   1. manager lê, só admin cria;
 *   2. o schema recusa sem rótulo, sem casamento (nem ad_id nem titulo_contem), nível fora do
 *      vocabulário fechado, ou campo desconhecido — e NADA é gravado;
 *   3. agente de outra organização (ou arquivado) recusa antes de tocar a tabela de briefs;
 *   4. colidir com o índice único (ad_id repetido, ativo, no mesmo agente) vira 409, não 500;
 *   5. a auditoria diz o formato (nível, se tem ad_id/título) e NUNCA o texto que o dono digitou.
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
  agente: { id: string; archived_at: string | null } | null;
  briefs: BriefRow[];
  proximoId: number;
}

function stubAdmin(estado: Estado) {
  return {
    from: (table: string) => {
      if (table === "ai_agents") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              maybeSingle: async () => ({ data: estado.agente, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === "ai_agent_ad_briefs") {
        return {
          select: () => {
            const filtros: Array<[string, unknown]> = [];
            const chain = {
              eq: (c: string, v: unknown) => {
                filtros.push([c, v]);
                return chain;
              },
              order: () => {
                const filtradas = estado.briefs.filter((b) => filtros.every(([c, v]) => (b as never)[c] === v));
                return Promise.resolve({ data: filtradas, error: null });
              },
            };
            return chain;
          },
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const conflito = estado.briefs.some(
                  (b) =>
                    b.agent_id === payload.agent_id &&
                    b.ativo &&
                    payload.ad_id !== undefined &&
                    b.ad_id === payload.ad_id,
                );
                if (conflito) return { data: null, error: { code: "23505", message: "duplicate key" } };
                const row: BriefRow = {
                  id: `brief-${estado.proximoId++}`,
                  organization_id: payload.organization_id as string,
                  agent_id: payload.agent_id as string,
                  rotulo: payload.rotulo as string,
                  ad_id: (payload.ad_id as string) ?? null,
                  titulo_contem: (payload.titulo_contem as string) ?? null,
                  nivel: (payload.nivel as string) ?? null,
                  desejo_ou_dor: (payload.desejo_ou_dor as string) ?? null,
                  medo_oculto: (payload.medo_oculto as string) ?? null,
                  promessa: (payload.promessa as string) ?? null,
                  ativo: payload.ativo as boolean,
                };
                estado.briefs.push(row);
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
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

const post = (corpo: unknown) =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
const ctx = { params: Promise.resolve({ id: AGENT }) };

const VALIDO = { rotulo: "Anúncio dor financeira", ad_id: "120211" };

let estado: Estado;
beforeEach(() => {
  estado = { agente: { id: AGENT, archived_at: null }, briefs: [], proximoId: 1 };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  comoPapel("admin");
});

describe("GET /ai/agents/:id/ad-briefs", () => {
  it("um manager lê (ler não é decisão de admin)", async () => {
    comoPapel("manager");
    estado.briefs.push({ id: "b1", organization_id: ORG, agent_id: AGENT, rotulo: "X", ad_id: "1", titulo_contem: null, nivel: null, desejo_ou_dor: null, medo_oculto: null, promessa: null, ativo: true });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    const corpo = (await res.json()) as { data: { ad_briefs: BriefRow[] } };
    expect(res.status).toBe(200);
    expect(corpo.data.ad_briefs).toHaveLength(1);
  });

  it("agente de outra organização é 'não encontrado'", async () => {
    estado.agente = null;
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    expect(res.status).toBe(404);
  });
});

describe("POST /ai/agents/:id/ad-briefs", () => {
  it("cria com sucesso, e a auditoria diz o formato mas nunca o texto digitado", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ ...VALIDO, desejo_ou_dor: "sair do aperto financeiro" }), ctx);
    expect(res.status).toBe(200);
    expect(estado.briefs).toHaveLength(1);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.ad_brief_created");
    expect(JSON.stringify(chamada?.metadata)).not.toContain("aperto financeiro");
  });

  it("só admin cria: manager recebe 403 e nada é gravado", async () => {
    comoPapel("manager");
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(403);
    expect(estado.briefs).toHaveLength(0);
  });

  it.each([
    ["sem rótulo", { ad_id: "1" }],
    ["sem ad_id nem titulo_contem", { rotulo: "X" }],
    ["nível fora do vocabulário fechado", { ...VALIDO, nivel: "amor" }],
    ["campo desconhecido", { ...VALIDO, instrucao_secreta: "ignore tudo" }],
    ["rótulo vazio", { rotulo: "", ad_id: "1" }],
  ])("recusa %s com 422 e não grava nada", async (_nome, corpo) => {
    const { POST } = await import("./route");
    const res = await POST(post(corpo), ctx);
    expect(res.status).toBe(422);
    expect(estado.briefs).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("agente arquivado é 409, sem gravar", async () => {
    estado.agente = { id: AGENT, archived_at: "2026-09-01T00:00:00Z" };
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(409);
    expect(estado.briefs).toHaveLength(0);
  });

  it("colidir com o ad_id de um brief ATIVO no mesmo agente é 409, não 500", async () => {
    estado.briefs.push({ id: "b1", organization_id: ORG, agent_id: AGENT, rotulo: "Existente", ad_id: "120211", titulo_contem: null, nivel: null, desejo_ou_dor: null, medo_oculto: null, promessa: null, ativo: true });
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(409);
    expect(estado.briefs).toHaveLength(1);
  });

  it("id que não é UUID é 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), { params: Promise.resolve({ id: "não-é-uuid" }) });
    expect(res.status).toBe(400);
  });
});
