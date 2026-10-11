/**
 * Criar versão pela API mandando só o que mudou NÃO zera o escopo do agente.
 *
 * `pipeline_ids` e `knowledge_source_ids` têm padrão `[]` no schema, e `[]` significa NENHUM. Um corpo
 * sem esses campos publicava um agente sem funil e sem material — em produção, um agente ficou 45
 * versões sem funil, com a ferramenta de agendar retorno recusada, e 35 versões sem material.
 *
 * O que estes testes prendem:
 *   1. campo AUSENTE no corpo herda o da versão mais recente;
 *   2. campo PRESENTE, mesmo vazio, é respeitado — esvaziar de propósito continua possível;
 *   3. a primeira versão do agente não tem de quem herdar e fica com o padrão;
 *   4. o herdado passa pela MESMA conferência de existência: funil apagado desde a versão anterior é 422;
 *   5. a auditoria diz o que foi herdado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { escopoParaAVersaoNova } from "@/lib/ai/agents/escopo-herdado";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";
const CREDENCIAL = "44444444-4444-4444-8444-444444444444";
const FUNIL = "55555555-5555-4555-8555-555555555555";
const OUTRO_FUNIL = "66666666-6666-4666-8666-666666666666";
const MATERIAL = "77777777-7777-4777-8777-777777777777";

interface Estado {
  anterior: { version_number: number; pipeline_ids: string[]; knowledge_source_ids: string[] } | null;
  funisQueExistem: string[];
  materiaisAtivos: string[];
  inseridas: Array<Record<string, unknown>>;
}

function stubAdmin(estado: Estado) {
  /** Uma cadeia que aceita qualquer filtro e resolve com `resposta` no fim. */
  const cadeia = (resposta: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => resposta;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
    return c;
  };
  return {
    from: (table: string) => {
      if (table === "ai_agents") return cadeia({ data: { id: AGENT, kind: "mcp_agent", archived_at: null }, error: null });
      if (table === "crm_pipelines") return cadeia({ data: estado.funisQueExistem.map((id) => ({ id })), error: null });
      if (table === "ai_knowledge_sources") return cadeia({ data: estado.materiaisAtivos.map((id) => ({ id })), error: null });
      if (table === "ai_agent_versions") {
        return {
          ...cadeia({ data: estado.anterior, error: null }),
          insert: (linha: Record<string, unknown>) => {
            estado.inseridas.push(linha);
            return { select: () => ({ single: async () => ({ data: { id: "nova", ...linha }, error: null }) }) };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

const CORPO = {
  system_prompt: "Você atende com calma e responde só o que sabe.",
  provider: "deepseek",
  model: "deepseek-flash",
  credential_id: CREDENCIAL,
  channel_session_id: null,
  tool_ids: [],
  handoff_keywords: [],
};

const post = (corpo: unknown) =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
const ctx = { params: Promise.resolve({ id: AGENT }) };

let estado: Estado;
beforeEach(() => {
  estado = {
    anterior: { version_number: 21, pipeline_ids: [FUNIL], knowledge_source_ids: [MATERIAL] },
    funisQueExistem: [FUNIL, OUTRO_FUNIL],
    materiaisAtivos: [MATERIAL],
    inseridas: [],
  };
  vi.mocked(createAdminClient).mockReturnValue(stubAdmin(estado) as never);
  vi.mocked(audit).mockClear();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER, idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "admin" },
  } as never);
});

describe("POST /ai/agents/:id/versions — o escopo que não veio é herdado", () => {
  it("corpo SEM funil e SEM material: a versão nova nasce com os da anterior", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(CORPO), ctx);

    expect(res.status).toBe(201);
    expect(estado.inseridas[0]).toMatchObject({
      version_number: 22,
      pipeline_ids: [FUNIL],
      knowledge_source_ids: [MATERIAL],
    });
  });

  it("corpo que MANDA os campos é respeitado, inclusive vazio — esvaziar de propósito continua possível", async () => {
    const { POST } = await import("./route");
    await POST(post({ ...CORPO, pipeline_ids: [OUTRO_FUNIL], knowledge_source_ids: [] }), ctx);

    expect(estado.inseridas[0]).toMatchObject({ pipeline_ids: [OUTRO_FUNIL], knowledge_source_ids: [] });
  });

  it("um campo veio e o outro não: só o ausente é herdado", async () => {
    const { POST } = await import("./route");
    await POST(post({ ...CORPO, pipeline_ids: [] }), ctx);

    expect(estado.inseridas[0]).toMatchObject({ pipeline_ids: [], knowledge_source_ids: [MATERIAL] });
  });

  it("primeira versão do agente: não há de quem herdar, fica o padrão", async () => {
    estado.anterior = null;
    const { POST } = await import("./route");
    await POST(post(CORPO), ctx);

    expect(estado.inseridas[0]).toMatchObject({ version_number: 1, pipeline_ids: [], knowledge_source_ids: [] });
  });

  it("o herdado passa pela MESMA conferência: funil apagado desde a versão anterior é 422, sem gravar", async () => {
    estado.funisQueExistem = [];
    const { POST } = await import("./route");
    const res = await POST(post(CORPO), ctx);

    expect(res.status).toBe(422);
    expect(estado.inseridas).toEqual([]);
  });

  it("a auditoria diz o que foi herdado", async () => {
    const { POST } = await import("./route");
    await POST(post({ ...CORPO, knowledge_source_ids: [MATERIAL] }), ctx);

    expect(vi.mocked(audit).mock.calls[0]?.[0]?.metadata).toMatchObject({ escopo_herdado: ["pipeline_ids"] });
  });
});

describe("escopoParaAVersaoNova — a regra, sem banco", () => {
  const validado = { pipeline_ids: [], knowledge_source_ids: [] };
  const anterior = { pipeline_ids: [FUNIL], knowledge_source_ids: [MATERIAL] };

  it("ausente herda; presente fica", () => {
    expect(escopoParaAVersaoNova({}, validado, anterior)).toEqual({
      pipeline_ids: [FUNIL],
      knowledge_source_ids: [MATERIAL],
      herdados: ["pipeline_ids", "knowledge_source_ids"],
    });
    expect(escopoParaAVersaoNova({ pipeline_ids: [], knowledge_source_ids: [] }, validado, anterior).herdados).toEqual([]);
  });

  it("versão anterior com coluna nula (clone sem a migration) vira lista vazia, sem lançar", () => {
    expect(escopoParaAVersaoNova({}, validado, { pipeline_ids: null, knowledge_source_ids: undefined })).toMatchObject({
      pipeline_ids: [],
      knowledge_source_ids: [],
    });
  });

  it("corpo que não é objeto não herda nada por engano de leitura: trata como ausente", () => {
    expect(escopoParaAVersaoNova(null, validado, anterior).herdados).toEqual(["pipeline_ids", "knowledge_source_ids"]);
  });
});
