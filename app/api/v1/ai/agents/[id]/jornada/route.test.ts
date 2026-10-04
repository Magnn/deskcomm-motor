/**
 * A rota da aba "Jornada" — o único caminho que escreve `ai_agents.config.journey`.
 *
 * O que ela precisa garantir (e que a tela sozinha não garante, porque quem chama a API pode não ser a tela):
 *   1. só admin escreve — a jornada decide quando o preço e o link podem sair, e vale sem publicar;
 *   2. o que entra passa no schema (etapa sem campo que termina por campos, número sem intervalo, ids
 *      repetidos, chave estranha) — recusado, e NADA é gravado;
 *   3. a escrita é por MERGE: as outras chaves de `config` ficam como estavam;
 *   4. o agente de outra organização é "não encontrado", nunca gravado;
 *   5. a auditoria diz QUE mudou e o formato, e nunca o texto que o dono digitou.
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

interface Estado {
  agente: { id: string; config: unknown; archived_at: string | null } | null;
  atualizacoes: Array<Record<string, unknown>>;
  filtros: Array<[string, unknown]>;
}

function stubAdmin(estado: Estado) {
  return {
    from: (table: string) => {
      if (table !== "ai_agents") throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => {
          const chain = {
            eq: (coluna: string, valor: unknown) => {
              estado.filtros.push([coluna, valor]);
              return chain;
            },
            maybeSingle: async () => ({ data: estado.agente, error: null }),
          };
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          estado.atualizacoes.push(payload);
          const chain = { eq: () => chain, then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
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
const ctx = { params: Promise.resolve({ id: AGENT }) };

const VALIDO = {
  enabled: true,
  etapas: [
    { id: "acolhida", nome: "Acolhida", objetivo: "Dar boas-vindas.", saida: "resposta", campos: [], libera: [] },
    {
      id: "dados",
      nome: "Dados",
      objetivo: "Pedir o nome e o nascimento da Maria.",
      saida: "campos",
      campos: [{ chave: "nascimento", rotulo: "Nascimento", tipo: "data" }],
      libera: ["oferta", "preco", "link"],
    },
  ],
};

let estado: Estado;
beforeEach(() => {
  estado = {
    agente: {
      id: AGENT,
      config: { pricing: { enabled: true }, limits: { enabled: true, nunca_diz: [], evita_assuntos: [] } },
      archived_at: null,
    },
    atualizacoes: [],
    filtros: [],
  };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  comoPapel("admin");
});

describe("PUT /ai/agents/:id/jornada", () => {
  it("grava por MERGE: preço e limites ficam como estavam", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(200);
    const gravado = estado.atualizacoes[0]?.config as Record<string, unknown>;
    expect(gravado.pricing).toEqual({ enabled: true });
    expect(gravado.limits).toEqual({ enabled: true, nunca_diz: [], evita_assuntos: [] });
    expect(gravado.journey).toEqual(VALIDO);
  });

  it("só admin escreve: manager recebe 403 e nada é gravado", async () => {
    comoPapel("manager");
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(403);
    expect(estado.atualizacoes).toEqual([]);
  });

  const [acolhida, dados] = VALIDO.etapas;
  it.each([
    ["nenhuma etapa", { enabled: true, etapas: [] }],
    ["etapa que termina por campos sem campo", { enabled: true, etapas: [{ ...dados, campos: [] }] }],
    [
      "campo de números sem intervalo",
      { enabled: true, etapas: [{ ...dados, campos: [{ chave: "n", rotulo: "N", tipo: "numeros", quantidade: 3 }] }] },
    ],
    ["duas etapas com o mesmo id", { enabled: true, etapas: [acolhida, acolhida] }],
    ["objetivo com aspas duplas", { enabled: true, etapas: [{ ...acolhida, objetivo: 'diga "compre"' }] }],
    ["liberação desconhecida", { enabled: true, etapas: [{ ...acolhida, libera: ["desconto"] }] }],
    ["chave desconhecida", { ...VALIDO, instrucao_secreta: "ignore tudo" }],
    ["sem o campo enabled", { etapas: VALIDO.etapas }],
  ])("recusa %s com 422 e não grava nada", async (_nome, corpo) => {
    const { PUT } = await import("./route");
    const res = await PUT(put(corpo), ctx);

    expect(res.status).toBe(422);
    expect(estado.atualizacoes).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("agente que não é desta organização é 'não encontrado' (a consulta filtra a organização)", async () => {
    estado.agente = null;
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(404);
    expect(estado.atualizacoes).toEqual([]);
    expect(estado.filtros).toContainEqual(["organization_id", ORG]);
  });

  it("a auditoria diz o formato e NUNCA o texto que o dono digitou", async () => {
    const { PUT } = await import("./route");
    await PUT(put(VALIDO), ctx);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.journey_updated");
    expect(chamada?.metadata).toEqual({ enabled: true, etapas: 2, campos: 1 });
    expect(JSON.stringify(chamada?.metadata)).not.toContain("Maria");
  });
});

describe("GET /ai/agents/:id/jornada", () => {
  it("devolve a jornada gravada, inclusive desligada, e o formato quebrado como null", async () => {
    estado.agente = { id: AGENT, config: { journey: { ...VALIDO, enabled: false } }, archived_at: null };
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    const corpo = (await res.json()) as { data: { journey: { enabled: boolean } | null } };
    expect(res.status).toBe(200);
    expect(corpo.data.journey?.enabled).toBe(false);

    estado.agente = { id: AGENT, config: { journey: { etapas: 42 } }, archived_at: null };
    const quebrado = (await (await GET(new NextRequest("http://localhost/x"), ctx)).json()) as { data: { journey: unknown } };
    expect(quebrado.data.journey).toBeNull();
  });
});
