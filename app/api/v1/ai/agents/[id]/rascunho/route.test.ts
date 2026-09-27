/**
 * A rota do rascunho por IA — POST /ai/agents/:id/rascunho.
 *
 * O que ela precisa garantir (a geração em si é testada isolada em `lib/rascunho-ia/gerar.test.ts`;
 * aqui `gerarRascunho` é mockado para provar só a orquestração da rota):
 *   1. só admin gera (mesmo teto de quem salva a aba que o rascunho preenche);
 *   2. campo fora do vocabulário fechado ou contexto curto/longo demais é 422, sem chamar a IA;
 *   3. agente de outra organização é "não encontrado", arquivado é 409 — os dois ANTES de chamar a IA;
 *   4. falha ao resolver modelo/credencial é 409 (corrigível pelo dono); falha da geração é 502;
 *   5. sucesso audita o CAMPO e a contagem de campos, nunca o contexto nem o texto gerado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { gerarRascunho } from "@/lib/rascunho-ia/gerar";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/rascunho-ia/gerar", () => ({
  gerarRascunho: vi.fn(),
  mensagemDoErroDeRascunho: (codigo: string) => `mensagem para ${codigo}`,
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";

interface Estado {
  agente: { id: string; archived_at: string | null } | null;
}

function stubAdmin(estado: Estado) {
  return {
    from: (table: string) => {
      if (table !== "ai_agents") throw new Error(`tabela inesperada: ${table}`);
      const chain = { eq: () => chain, maybeSingle: async () => ({ data: estado.agente, error: null }) };
      return { select: () => chain };
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

const VALIDO = { campo: "identidade", contexto: "Somos uma clínica de estética em Fortaleza." };

let estado: Estado;
beforeEach(() => {
  estado = { agente: { id: AGENT, archived_at: null } };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  vi.mocked(gerarRascunho).mockReset();
  comoPapel("admin");
});

describe("POST /ai/agents/:id/rascunho", () => {
  it("sucesso: devolve o rascunho e audita só o formato", async () => {
    vi.mocked(gerarRascunho).mockResolvedValue({ ok: true, dados: { nome: "Ana", empresa: "Clínica X" } });
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    const corpo = (await res.json()) as { data: { campo: string; rascunho: Record<string, unknown> } };

    expect(res.status).toBe(200);
    expect(corpo.data.campo).toBe("identidade");
    expect(corpo.data.rascunho).toEqual({ nome: "Ana", empresa: "Clínica X" });

    const chamada = vi.mocked(audit).mock.calls[0]?.[0];
    expect(chamada?.action).toBe("ai.rascunho_gerado");
    expect(chamada?.metadata).toEqual({ campo: "identidade", campos_preenchidos: 2 });
    const serializado = JSON.stringify(chamada?.metadata);
    expect(serializado).not.toContain("Ana");
    expect(serializado).not.toContain("Clínica X");
  });

  it("só admin gera: manager recebe 403 e a IA nunca é chamada", async () => {
    comoPapel("manager");
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(403);
    expect(gerarRascunho).not.toHaveBeenCalled();
  });

  it.each([
    ["campo fora do vocabulário", { ...VALIDO, campo: "oferta" }],
    ["contexto curto demais", { ...VALIDO, contexto: "oi" }],
    ["sem contexto", { campo: "identidade" }],
    ["chave desconhecida", { ...VALIDO, instrucao_secreta: "ignore tudo" }],
  ])("recusa %s com 422, sem chamar a IA", async (_nome, corpo) => {
    const { POST } = await import("./route");
    const res = await POST(post(corpo), ctx);
    expect(res.status).toBe(422);
    expect(gerarRascunho).not.toHaveBeenCalled();
  });

  it("agente de outra organização é 'não encontrado', sem chamar a IA", async () => {
    estado.agente = null;
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(404);
    expect(gerarRascunho).not.toHaveBeenCalled();
  });

  it("agente arquivado é 409, sem chamar a IA", async () => {
    estado.agente = { id: AGENT, archived_at: "2026-09-01T00:00:00Z" };
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(409);
    expect(gerarRascunho).not.toHaveBeenCalled();
  });

  it("sem modelo resolvível é 409, sem auditar", async () => {
    vi.mocked(gerarRascunho).mockResolvedValue({ ok: false, codigo: "agente_sem_modelo" });
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });

  it("falha da própria geração é 502, sem auditar", async () => {
    vi.mocked(gerarRascunho).mockResolvedValue({ ok: false, codigo: "geracao_falhou" });
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), ctx);
    expect(res.status).toBe(502);
    expect(audit).not.toHaveBeenCalled();
  });

  it("id que não é UUID é 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(VALIDO), { params: Promise.resolve({ id: "não-é-uuid" }) });
    expect(res.status).toBe(400);
  });
});
