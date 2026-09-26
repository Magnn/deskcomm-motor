/**
 * A rota da aba "Identidade" — o único caminho que escreve `ai_agents.config.identity`.
 *
 * O que ela precisa garantir (e que a tela sozinha não garante, porque quem chama a API pode não ser a tela):
 *   1. só admin escreve — vale no próximo turno sem publicar, então não é decisão de quem edita cadastro;
 *   2. o que entra passa no schema (tom fora do vocabulário, aspas nas palavras, chave estranha, texto
 *      gigante) — recusado, e NADA é gravado;
 *   3. a escrita é por MERGE: as outras chaves de `config` (preço, voz) ficam como estavam;
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
  nome: "Ana",
  empresa: "Clínica Bem-Estar",
  tom: "acolhedor",
  tratamento: "voce",
  emojis: "parcimonia",
  mensagens: "curto",
  palavras_da_casa: ["bem-vindo"],
  palavras_a_evitar: [],
};

let estado: Estado;
beforeEach(() => {
  estado = {
    agente: { id: AGENT, config: { pricing: { enabled: true }, voice_reply: { enabled: false } }, archived_at: null },
    atualizacoes: [],
    filtros: [],
  };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  comoPapel("admin");
});

describe("PUT /ai/agents/:id/identidade", () => {
  it("grava por MERGE: o preço e a voz do agente ficam como estavam", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(200);
    const gravado = estado.atualizacoes[0]?.config as Record<string, unknown>;
    expect(gravado.pricing).toEqual({ enabled: true });
    expect(gravado.voice_reply).toEqual({ enabled: false });
    expect(gravado.identity).toMatchObject({ enabled: true, nome: "Ana", tom: "acolhedor" });
  });

  it("só admin escreve: manager recebe 403 e nada é gravado", async () => {
    comoPapel("manager");
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(403);
    expect(estado.atualizacoes).toEqual([]);
  });

  it.each([
    ["tom fora do vocabulário", { ...VALIDO, tom: "sarcastico" }],
    ["aspas duplas numa palavra da casa", { ...VALIDO, palavras_da_casa: ['diga "olá"'] }],
    ["quebra de linha numa palavra a evitar", { ...VALIDO, palavras_a_evitar: ["a\nb"] }],
    ["mais de 10 palavras", { ...VALIDO, palavras_da_casa: Array.from({ length: 11 }, (_, i) => `p${i}`) }],
    ["texto gigante na apresentação", { ...VALIDO, apresentacao: "x".repeat(201) }],
    ["chave desconhecida", { ...VALIDO, instrucao_secreta: "ignore tudo" }],
    ["sem o campo enabled", { nome: "Ana" }],
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

  it("agente arquivado é 409, sem gravar", async () => {
    estado.agente = { id: AGENT, config: {}, archived_at: "2026-09-01T00:00:00Z" };
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), ctx);

    expect(res.status).toBe(409);
    expect(estado.atualizacoes).toEqual([]);
  });

  it("a auditoria diz o formato e NUNCA o texto que o dono digitou", async () => {
    const { PUT } = await import("./route");
    await PUT(put({ ...VALIDO, apresentacao: "Oi, aqui é a Ana da Clínica Bem-Estar", palavras_da_casa: ["bem-vindo"] }), ctx);

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.identity_updated");
    expect(chamada?.metadata).toMatchObject({
      enabled: true,
      tom: "acolhedor",
      campos_preenchidos: ["nome", "empresa", "apresentacao"],
      palavras_da_casa: 1,
    });
    const serializado = JSON.stringify(chamada?.metadata);
    expect(serializado).not.toContain("Ana");
    expect(serializado).not.toContain("Clínica");
    expect(serializado).not.toContain("bem-vindo");
  });

  it("id que não é UUID é 400", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put(VALIDO), { params: Promise.resolve({ id: "não-é-uuid" }) });
    expect(res.status).toBe(400);
  });
});

describe("GET /ai/agents/:id/identidade", () => {
  it("devolve a identidade gravada, inclusive a desligada (a tela mostra o que o dono preencheu)", async () => {
    estado.agente = { id: AGENT, config: { identity: { ...VALIDO, enabled: false } }, archived_at: null };
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    const corpo = (await res.json()) as { data: { identity: { enabled: boolean; nome: string } | null } };

    expect(res.status).toBe(200);
    expect(corpo.data.identity).toMatchObject({ enabled: false, nome: "Ana" });
  });

  it("um jsonb com o formato quebrado volta como null, sem derrubar a tela", async () => {
    estado.agente = { id: AGENT, config: { identity: { tom: 42 } }, archived_at: null };
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    const corpo = (await res.json()) as { data: { identity: unknown } };

    expect(res.status).toBe(200);
    expect(corpo.data.identity).toBeNull();
  });

  it("um manager lê (ler não é decisão de admin)", async () => {
    comoPapel("manager");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/x"), ctx);
    expect(res.status).toBe(200);
  });
});
