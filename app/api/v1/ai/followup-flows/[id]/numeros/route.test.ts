/**
 * GET /api/v1/ai/followup-flows/:id/numeros — quem atende cada número, do ponto
 * de vista deste fluxo. É o que o painel do gatilho mostra antes de o dono ligar
 * o vínculo: ele precisa ver de QUEM está tirando o número.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({ role: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));

import { GET } from "./route";

const ESTE = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const SUMIDO = "33333333-3333-4333-8333-333333333333";

let fluxoExiste: boolean;
let filtrosDosCanais: Record<string, unknown>;
let idsDosNomes: string[] | null;

const canal = (id: string, metadata: unknown) => ({
  id,
  display_name: `Número ${id}`,
  phone_number: "+5511999990000",
  waha_session_name: null,
  metadata,
});

function adminFake() {
  return {
    from(tabela: string) {
      if (tabela === "channel_sessions") {
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => {
            filtrosDosCanais[c] = v;
            return q;
          },
          in: () => q,
          is: (c: string, v: unknown) => {
            filtrosDosCanais[c] = v;
            return q;
          },
          order: async () => ({
            data: [
              canal("a", { handling_mode: "flow", default_flow_pointer_id: ESTE }),
              canal("b", { handling_mode: "flow", default_flow_pointer_id: OUTRO }),
              canal("c", { handling_mode: "flow", default_flow_pointer_id: SUMIDO }),
              canal("d", null),
              canal("e", { handling_mode: "human" }),
            ],
            error: null,
          }),
        };
        return q;
      }
      // followup_flow_pointers: 1ª leitura = o fluxo pedido; 2ª = nomes dos outros.
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: fluxoExiste ? { id: ESTE } : null, error: null }),
        in: async (_c: string, ids: string[]) => {
          idsDosNomes = ids;
          return { data: [{ id: OUTRO, name: "Boas-vindas" }], error: null };
        },
      };
      return q;
    },
  };
}

const get = () =>
  GET(new NextRequest(`http://localhost/api/v1/ai/followup-flows/${ESTE}/numeros`), {
    params: Promise.resolve({ id: ESTE }),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  fluxoExiste = true;
  filtrosDosCanais = {};
  idsDosNomes = null;
  deps.role.mockResolvedValue({ ok: true, user: { id: "eu" }, org: { orgId: "org-1", role: "viewer" } });
  deps.admin.mockReturnValue(adminFake());
});

describe("GET /api/v1/ai/followup-flows/[id]/numeros", () => {
  it("diz, de cada número, quem atende hoje", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ id: string; dono: string; outro_fluxo: string | null }> };
    expect(data.map((n) => [n.id, n.dono, n.outro_fluxo])).toEqual([
      ["a", "este_fluxo", null],
      ["b", "outro_fluxo", "Boas-vindas"],
      ["c", "outro_fluxo", null], // o fluxo dono foi apagado: sem nome, mas ainda é "outro fluxo"
      ["d", "agente", null],
      ["e", "humano", null],
    ]);
  });

  it("só olha números DESTA organização, e não os arquivados", async () => {
    await get();
    expect(filtrosDosCanais).toMatchObject({ organization_id: "org-1", archived_at: null });
  });

  it("busca o nome só dos OUTROS fluxos — nunca o deste", async () => {
    await get();
    expect(idsDosNomes).toEqual([OUTRO, SUMIDO]);
  });

  it("não devolve o metadata cru do número", async () => {
    const { data } = (await (await get()).json()) as { data: Array<Record<string, unknown>> };
    expect(data.every((n) => !("metadata" in n))).toBe(true);
  });

  it("fluxo que não é desta organização: 404", async () => {
    fluxoExiste = false;
    expect((await get()).status).toBe(404);
  });
});
