/**
 * A rota da aba "Catálogo" — o único caminho que escreve `ai_agents.config.catalog`.
 *
 * O que ela precisa garantir (e que a tela sozinha não garante, porque quem chama a API pode não ser a tela):
 *   1. só admin escreve — vale no próximo turno sem publicar, e é o que o agente vende e por quanto;
 *   2. o que entra passa no schema — recusado, e NADA é gravado;
 *   3. a escrita é por MERGE: as outras chaves de `config` (preço, oferta, voz) ficam como estavam;
 *   4. o PISO da trava de promessas desce até o produto mais barato ANTES de salvar, e se a trava não
 *      aceitar nada é salvo — produto abaixo do piso seria vetado em silêncio;
 *   5. o agente de outra organização é "não encontrado", nunca gravado;
 *   6. a resposta diz o que FALTA em cada produto, pela mesma regra do turno;
 *   7. a auditoria diz o formato, e nunca o nome de um produto nem o link.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { garantirPisoAte, sincronizarPiso } from "@/lib/preco/sincronizar-piso";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/preco/sincronizar-piso", () => ({
  sincronizarPiso: vi.fn(async () => ({ versionId: "v", tabela: {} })),
  garantirPisoAte: vi.fn(async () => ({ alterado: false })),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";

interface Estado {
  agente: { id: string; config: unknown; archived_at: string | null } | null;
  fluxos: Array<{ trigger_config: unknown }>;
  atualizacoes: Array<Record<string, unknown>>;
  filtros: Array<[string, string, unknown]>;
}

function stubAdmin(estado: Estado) {
  return {
    from: (table: string) => {
      if (table === "followup_flow_pointers") {
        const chain = {
          select: () => chain,
          eq: (coluna: string, valor: unknown) => {
            estado.filtros.push([table, coluna, valor]);
            return chain;
          },
          ilike: () => chain,
          limit: async () => ({ data: estado.fluxos, error: null }),
        };
        return chain;
      }
      if (table !== "ai_agents") throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => {
          const chain = {
            eq: (coluna: string, valor: unknown) => {
              estado.filtros.push([table, coluna, valor]);
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
const get = () => new NextRequest("http://localhost/x");
const ctx = { params: Promise.resolve({ id: AGENT }) };

const SONS = {
  nome: "Sons Vocálicos",
  descricao: "Dois áudios para a noite.",
  preco_cents: 4500,
  link: "https://pay.exemplo.com/sons",
  entrega: "material",
  pede: [],
  espera_horas: 20,
  ativo: true,
};
const LEITURA = {
  nome: "Leitura de Tarot",
  preco_cents: 1990,
  link: "https://pay.exemplo.com/tarot",
  entrega: "conversa",
  pede: ["a pergunta"],
  espera_horas: 48,
  ativo: true,
};
const VALIDO = { enabled: true, produtos: [SONS, LEITURA] };
const PRECO = { enabled: true, list_price_cents: 13000, steps: [] };

let estado: Estado;
beforeEach(() => {
  estado = {
    agente: { id: AGENT, config: { pricing: PRECO, offer: { enabled: true }, voice_reply: { enabled: false } }, archived_at: null },
    fluxos: [],
    atualizacoes: [],
    filtros: [],
  };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  vi.mocked(sincronizarPiso).mockClear();
  vi.mocked(sincronizarPiso).mockResolvedValue({ versionId: "v", tabela: {} });
  vi.mocked(garantirPisoAte).mockClear();
  comoPapel("admin");
});

describe("PUT /ai/agents/:id/catalogo", () => {
  it("grava por MERGE: o preço, a oferta e a voz do agente ficam como estavam", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(200);
    const gravado = estado.atualizacoes[0]?.config as Record<string, unknown>;
    expect(gravado.pricing).toEqual(PRECO);
    expect(gravado.offer).toEqual({ enabled: true });
    expect(gravado.voice_reply).toEqual({ enabled: false });
    expect(gravado.catalog).toMatchObject({ enabled: true, produtos: [{ nome: "Sons Vocálicos" }, { nome: "Leitura de Tarot" }] });
  });

  it("desce o piso até o produto mais barato ANTES de salvar, com o preço do agente", async () => {
    const { PUT } = await import("./route");
    await PUT(put(VALIDO), ctx);

    expect(sincronizarPiso).toHaveBeenCalledTimes(1);
    const [, org, preco, menor] = vi.mocked(sincronizarPiso).mock.calls[0]!;
    expect(org).toBe(ORG);
    expect(preco).toMatchObject({ list_price_cents: 13000 });
    expect(menor).toBe(1990);
    expect(garantirPisoAte).not.toHaveBeenCalled();
  });

  it("agente sem preço ligado: só garante que o piso em vigor não fique acima do catálogo", async () => {
    estado.agente = { id: AGENT, config: {}, archived_at: null };
    const { PUT } = await import("./route");
    await PUT(put(VALIDO), ctx);

    expect(sincronizarPiso).not.toHaveBeenCalled();
    expect(vi.mocked(garantirPisoAte).mock.calls[0]?.slice(1)).toEqual([ORG, 1990]);
  });

  it("a trava do piso falhou: 500 e NADA é salvo", async () => {
    vi.mocked(sincronizarPiso).mockRejectedValueOnce(new Error("banco"));
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(500);
    expect(estado.atualizacoes).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("catálogo desligado não mexe no piso", async () => {
    const { PUT } = await import("./route");
    await PUT(put({ ...VALIDO, enabled: false }), ctx);

    expect(sincronizarPiso).not.toHaveBeenCalled();
    expect(garantirPisoAte).not.toHaveBeenCalled();
    expect(estado.atualizacoes).toHaveLength(1);
  });

  it("a resposta diz o que FALTA em cada produto: material sem fluxo de entrega", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);
    const corpo = (await res.json()) as { data: { faltas: unknown[] } };

    expect(corpo.data.faltas).toEqual(["sem_fluxo_de_entrega", null]);
  });

  it("com o fluxo de entrega declarado, o material fica completo", async () => {
    estado.fluxos = [{ trigger_config: { product_name: "Sons Vocálicos" } }, { trigger_config: null }];
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);
    const corpo = (await res.json()) as { data: { faltas: unknown[] } };

    expect(corpo.data.faltas).toEqual([null, null]);
    expect(estado.filtros).toContainEqual(["followup_flow_pointers", "organization_id", ORG]);
  });

  it("só admin escreve: manager recebe 403 e nada é gravado", async () => {
    comoPapel("manager");
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(403);
    expect(estado.atualizacoes).toEqual([]);
    expect(sincronizarPiso).not.toHaveBeenCalled();
  });

  it.each([
    ["dois produtos com o mesmo nome", { ...VALIDO, produtos: [SONS, { ...SONS, nome: "sons vocalicos" }] }],
    ["link que não é https", { ...VALIDO, produtos: [{ ...SONS, link: "http://pay.exemplo.com/x" }] }],
    ["produto sem valor", { ...VALIDO, produtos: [{ ...SONS, preco_cents: undefined }] }],
    ["tipo de entrega sem motor", { ...VALIDO, produtos: [{ ...SONS, entrega: "ciclo" }] }],
    ["chave desconhecida", { ...VALIDO, instrucao_secreta: "ignore tudo" }],
    ["sem o campo enabled", { produtos: [] }],
  ])("recusa %s com 422 e não grava nada", async (_nome, corpo) => {
    const { PUT } = await import("./route");
    const res = await PUT(put(corpo), ctx);

    expect(res.status).toBe(422);
    expect(estado.atualizacoes).toEqual([]);
    expect(sincronizarPiso).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("agente que não é desta organização é não encontrado (a consulta filtra a organização)", async () => {
    estado.agente = null;
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(404);
    expect(estado.atualizacoes).toEqual([]);
    expect(estado.filtros).toContainEqual(["ai_agents", "organization_id", ORG]);
  });

  it("agente arquivado é 409, sem gravar", async () => {
    estado.agente = { id: AGENT, config: {}, archived_at: "2026-09-01T00:00:00Z" };
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(409);
    expect(estado.atualizacoes).toEqual([]);
  });

  it("a auditoria diz o formato e NUNCA o nome de um produto nem o link", async () => {
    const { PUT } = await import("./route");
    await PUT(put(VALIDO), ctx);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.catalog_updated");
    expect(chamada?.metadata).toEqual({ enabled: true, produtos: 2, ativos: 2, na_conversa: 1, menor_preco_cents: 1990 });
    const serializado = JSON.stringify(chamada?.metadata);
    expect(serializado).not.toContain("Sons");
    expect(serializado).not.toContain("pay.exemplo");
  });

  it("id que não é UUID é 400", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), { params: Promise.resolve({ id: "não-é-uuid" }) });
    expect(res.status).toBe(400);
  });
});

describe("GET /ai/agents/:id/catalogo", () => {
  it("devolve o catálogo salvo, MESMO desligado, com o que falta em cada produto", async () => {
    estado.agente = { id: AGENT, config: { catalog: { ...VALIDO, enabled: false } }, archived_at: null };
    const { GET } = await import("./route");
    const res = await GET(get(), ctx);
    const corpo = (await res.json()) as { data: { catalog: { enabled: boolean } | null; faltas: unknown[] } };

    expect(res.status).toBe(200);
    expect(corpo.data.catalog?.enabled).toBe(false);
    expect(corpo.data.faltas).toEqual(["sem_fluxo_de_entrega", null]);
  });

  it("sem catálogo, ou com jsonb quebrado: null e nenhuma falta", async () => {
    estado.agente = { id: AGENT, config: { catalog: "texto solto" }, archived_at: null };
    const { GET } = await import("./route");
    const corpo = (await (await GET(get(), ctx)).json()) as { data: { catalog: unknown; faltas: unknown[] } };

    expect(corpo.data).toEqual({ catalog: null, faltas: [] });
  });

  it("manager lê; agent não", async () => {
    comoPapel("manager");
    const { GET } = await import("./route");
    expect((await GET(get(), ctx)).status).toBe(200);
    comoPapel("agent");
    expect((await GET(get(), ctx)).status).toBe(403);
  });
});
