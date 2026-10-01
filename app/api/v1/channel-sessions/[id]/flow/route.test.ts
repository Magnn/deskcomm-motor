/**
 * PATCH /api/v1/channel-sessions/:id/flow — vincular um número a um fluxo.
 *
 * O vínculo tira o agente de IA do número. Se o fluxo escolhido não roda
 * (rascunho, desativado, de outra organização), o número fica MUDO — por isso o
 * servidor confere antes de gravar, e diz por quê quando recusa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({ role: vi.fn(), support: vi.fn(), audit: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));

import { PATCH } from "./route";

const CANAL = "11111111-1111-4111-8111-111111111111";
const FLUXO = "22222222-2222-4222-8222-222222222222";

type Fluxo = { id: string; status: string; active_version_id: string | null; surface: string } | null;

let fluxo: Fluxo;
let gravado: Record<string, unknown> | null;
let filtrosDoFluxo: Record<string, unknown>;

function adminFake() {
  return {
    from(tabela: string) {
      if (tabela === "followup_flow_pointers") {
        const q = {
          select: () => q,
          eq: (coluna: string, valor: unknown) => {
            filtrosDoFluxo[coluna] = valor;
            return q;
          },
          maybeSingle: async () => ({ data: fluxo, error: null }),
        };
        return q;
      }
      const leitura = {
        select: () => leitura,
        eq: () => leitura,
        is: () => leitura,
        maybeSingle: async () => ({ data: { metadata: { ai_gate: "open" } }, error: null }),
      };
      const escrita = { eq: () => escrita, then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r) };
      return {
        ...leitura,
        update(payload: { metadata: Record<string, unknown> }) {
          gravado = payload.metadata;
          return escrita;
        },
      };
    },
  };
}

const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://localhost/api/v1/channel-sessions/${CANAL}/flow`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: CANAL }) } as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fluxo = { id: FLUXO, status: "active", active_version_id: "v1", surface: "followup" };
  gravado = null;
  filtrosDoFluxo = {};
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: "eu" }, org: { orgId: "org-1", role: "admin" } });
  deps.admin.mockReturnValue(adminFake());
});

describe("PATCH /api/v1/channel-sessions/[id]/flow", () => {
  it("fluxo publicado: grava o vínculo sem apagar o resto do metadata", async () => {
    const res = await patch({ handling_mode: "flow", default_flow_pointer_id: FLUXO });
    expect(res.status).toBe(200);
    expect(gravado).toEqual({ ai_gate: "open", handling_mode: "flow", default_flow_pointer_id: FLUXO });
  });

  it("o fluxo é procurado NA organização de quem pede — nunca só pelo id do body", async () => {
    await patch({ handling_mode: "flow", default_flow_pointer_id: FLUXO });
    expect(filtrosDoFluxo).toMatchObject({ organization_id: "org-1", id: FLUXO });
  });

  it("fluxo de outra organização (ou apagado): recusa e não grava", async () => {
    fluxo = null;
    const res = await patch({ handling_mode: "flow", default_flow_pointer_id: FLUXO });
    expect(res.status).toBe(422);
    expect(gravado).toBeNull();
  });

  it.each([
    ["rascunho", { status: "draft", active_version_id: null }],
    ["desativado", { status: "disabled", active_version_id: "v1" }],
  ])("fluxo %s: recusa dizendo para publicar, e não grava", async (_caso, estado) => {
    fluxo = { id: FLUXO, surface: "followup", ...estado };
    const res = await patch({ handling_mode: "flow", default_flow_pointer_id: FLUXO });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("flow_not_active");
    expect(corpo.error.message).toContain("Publique o fluxo");
    expect(gravado).toBeNull();
  });

  it("roteiro de atendimento não pode ser dono de número", async () => {
    fluxo = { id: FLUXO, status: "active", active_version_id: "v1", surface: "atendimento" };
    const res = await patch({ handling_mode: "flow", default_flow_pointer_id: FLUXO });
    expect(res.status).toBe(422);
    expect(gravado).toBeNull();
  });

  it("modo fluxo sem fluxo: recusa", async () => {
    const res = await patch({ handling_mode: "flow" });
    expect(res.status).toBe(422);
    expect(gravado).toBeNull();
  });

  it("devolver ao agente de IA: grava sem conferir fluxo nenhum, e limpa o fluxo guardado", async () => {
    fluxo = null;
    const res = await patch({ handling_mode: "ai", default_flow_pointer_id: FLUXO });
    expect(res.status).toBe(200);
    expect(gravado).toEqual({ ai_gate: "open", handling_mode: "ai", default_flow_pointer_id: null });
  });
});
