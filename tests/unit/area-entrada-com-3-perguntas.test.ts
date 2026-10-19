/**
 * A ENTRADA COM 3 PERGUNTAS DA ÁREA (pedido do dono em 19/10/2026): foco, o que pesa e nascimento — e a área
 * abre "feita para ela" (o céu do nascimento e perguntas da Mesa no tema).
 *
 * O que este arquivo guarda:
 *  - o céu do nascimento sai da astronomia de verdade (datas conhecidas) e recusa data que não serve;
 *  - cada foco tem nome, tema e três perguntas prontas para a Mesa;
 *  - a rota grava foco e frase, aceita pular (grava mesmo assim, para não perguntar de novo), só grava o
 *    nascimento se ainda não havia, e devolve o céu calculado;
 *  - foco que não existe é recusado.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  upserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  eventos: [] as Array<Record<string, unknown>>,
  birthdate: null as string | null,
}));

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: vi.fn(async (_a: unknown, e: Record<string, unknown>) => void h.eventos.push(e)) }));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: {} },
    sessao: { contactId: "contato-1", sessaoId: "sessao-1" },
    admin: {
      from: (tabela: string) => {
        if (tabela === "area_perfis") return { upsert: async (linha: Record<string, unknown>) => (h.upserts.push(linha), { error: null }) };
        const q: Record<string, unknown> = {};
        let atualizando: Record<string, unknown> | null = null;
        q.update = (patch: Record<string, unknown>) => ((atualizando = patch), q);
        q.eq = () => q;
        q.is = () => q;
        q.select = () => {
          if (atualizando) {
            const gravou = h.birthdate === null;
            if (gravou) {
              h.updates.push(atualizando);
              h.birthdate = String(atualizando.birthdate);
            }
            return Promise.resolve({ data: gravou ? [{ id: "contato-1" }] : [], error: null });
          }
          return q;
        };
        q.maybeSingle = async () => ({ data: { birthdate: h.birthdate }, error: null });
        return q;
      },
    },
  }),
}));

import { ceuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { FOCOS, NOME_DO_FOCO, PERGUNTAS_DO_FOCO } from "@/lib/area-do-cliente/perfil";

beforeEach(() => {
  h.upserts = [];
  h.updates = [];
  h.eventos = [];
  h.birthdate = null;
});

describe("o céu do nascimento", () => {
  it("o Sol sai do cálculo de verdade, em datas conhecidas", () => {
    expect(ceuDoNascimento("1978-03-23")?.sol).toBe("Áries");
    expect(ceuDoNascimento("2000-01-01")?.sol).toBe("Capricórnio");
    expect(ceuDoNascimento("1990-08-15")?.sol).toBe("Leão");
  });

  it("a Lua vem com a dúvida dita quando muda de signo no dia", () => {
    const c = ceuDoNascimento("1978-03-23")!;
    expect(typeof c.lua).toBe("string");
    expect(c.luaCerta ? c.luaOutra : typeof c.luaOutra).toBe(c.luaCerta ? null : "string");
  });

  it("data que não serve não tem céu", () => {
    expect(ceuDoNascimento(null)).toBeNull();
    expect(ceuDoNascimento("1800-01-01")).toBeNull();
    expect(ceuDoNascimento("2099-01-01")).toBeNull();
  });

  it("cada foco tem nome, tema e três perguntas prontas", () => {
    for (const f of FOCOS) {
      expect(NOME_DO_FOCO[f].nome.length).toBeGreaterThan(3);
      expect(PERGUNTAS_DO_FOCO[f]).toHaveLength(3);
      for (const q of PERGUNTAS_DO_FOCO[f]) expect(q.endsWith("?")).toBe(true);
    }
  });
});

async function responder(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/perfil/route");
  const res = await POST(
    new NextRequest("https://area.test/api/v1/area/publica/magno/perfil", { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ org: "magno" }) },
  );
  return { status: res.status, json: (await res.json()) as { data?: { ceu: { sol: string } | null } } };
}

describe("POST /perfil", () => {
  it("⭐ grava o foco e a frase, guarda o nascimento e devolve o céu", async () => {
    const r = await responder({ foco: "amor", o_que_pesa: "Ele sumiu e eu não sei o que fazer", nascimento: "1978-03-23" });
    expect(r.status).toBe(200);
    expect(h.upserts[0]).toMatchObject({ organization_id: "org-1", contact_id: "contato-1", foco: "amor", o_que_pesa: "Ele sumiu e eu não sei o que fazer" });
    expect(h.updates).toEqual([{ birthdate: "1978-03-23" }]);
    expect(r.json.data?.ceu?.sol).toBe("Áries");
    expect(h.eventos.map((e) => e.tipo)).toEqual(["aniversario_salvo", "perfil_salvo"]);
  });

  it("pular também grava (para não perguntar de novo), sem céu", async () => {
    const r = await responder({ foco: null, o_que_pesa: null, nascimento: null });
    expect(r.status).toBe(200);
    expect(h.upserts[0]).toMatchObject({ foco: null, o_que_pesa: null });
    expect(r.json.data?.ceu).toBeNull();
    expect(h.eventos.at(-1)).toMatchObject({ tipo: "perfil_salvo", props: { foco: null, pulou: true } });
  });

  it("nascimento já sabido não é trocado", async () => {
    h.birthdate = "1990-08-15";
    const r = await responder({ foco: "caminhos", nascimento: "1978-03-23" });
    expect(h.updates).toEqual([]);
    expect(r.json.data?.ceu?.sol).toBe("Leão");
  });

  it("foco que não existe ou data impossível: recusa sem gravar", async () => {
    expect((await responder({ foco: "loteria" })).status).toBe(422);
    expect((await responder({ foco: "amor", nascimento: "2099-01-01" })).status).toBe(422);
    expect(h.upserts).toEqual([]);
  });
});
