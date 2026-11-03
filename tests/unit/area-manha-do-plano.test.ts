/**
 * A SUA MANHÃ (migration 0956) e A MÃO DA SEMANA do plano — o que o plano de entrada entrega a mais.
 *
 * O que este arquivo guarda:
 *  - a manhã é só de quem tem o Plano da Semana ou o Círculo: sem eles, 403 e nenhuma chamada de IA;
 *  - uma chamada de IA por pessoa por dia: a manhã gravada volta sem chamar a IA de novo;
 *  - o pedido à IA leva o céu de verdade (os signos do nascimento) e proíbe previsão;
 *  - a resposta da IA sem uma das três partes não vai à tela;
 *  - a mão do plano: uma por semana, só com o plano em dia.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lerManha, manhaGravada, pedidoDaManha, temAManha, type DadosDaManha } from "@/lib/area-do-cliente/manha";

const MANHA = { carta: "A Estrela pede calma.", energia: "A Lua em Touro conversa com o seu Sol.", gesto: "Beba um copo de água olhando o céu." };

const h = vi.hoisted(() => ({
  escrever: vi.fn(),
  noPlano: false,
  validoAte: null as string | null,
  linhas: {} as Record<string, unknown>,
  listas: {} as Record<string, unknown[]>,
  chamadas: [] as Array<[string, string, unknown]>,
}));

function adminFalso() {
  return {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const reg = (metodo: string) => (arg: unknown, ...resto: unknown[]) => {
        h.chamadas.push([tabela, metodo, resto.length ? [arg, ...resto] : arg]);
        return q;
      };
      for (const m of ["select", "eq", "gte", "limit", "order"]) q[m] = reg(m);
      q.upsert = async (linha: unknown, opcoes: unknown) => {
        h.chamadas.push([tabela, "upsert", [linha, opcoes]]);
        return { error: null };
      };
      q.maybeSingle = async () => ({ data: h.linhas[tabela] ?? null, error: null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: h.listas[tabela] ?? [], error: null });
      return q;
    },
  };
}

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({}) }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ llmEdgeConfigFromEnv: () => ({}) }));
vi.mock("@/lib/i18n/area-servidor", () => ({ idiomaDaAreaOuPortugues: async () => "pt-BR" }));
vi.mock("@/lib/area-do-cliente/manha-ia", () => ({ escreverManha: h.escrever }));
vi.mock("@/lib/area-do-cliente/plano-semanal", async (orig) => ({
  ...(await orig<typeof import("@/lib/area-do-cliente/plano-semanal")>()),
  temPlanoSemanal: async () => h.noPlano,
}));
vi.mock("@/lib/area-do-cliente/circulo", async (orig) => ({
  ...(await orig<typeof import("@/lib/area-do-cliente/circulo")>()),
  lerAssinatura: async () => h.validoAte,
}));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Sao_Paulo", config: { carta_do_dia: true, circulo: { ativo: true } } },
    sessao: { contactId: "c-1", sessaoId: "s-1" },
    admin: adminFalso(),
  }),
}));

beforeEach(() => {
  h.escrever.mockReset().mockResolvedValue({ ok: true, manha: MANHA, modelo: "m" });
  h.noPlano = false;
  h.validoAte = null;
  h.linhas = { contacts: { name: "Ana Paula", display_name: null, birthdate: "1980-05-10" } };
  h.listas = {};
  h.chamadas = [];
});

async function pedir() {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/manha/route");
  return POST(new NextRequest("https://x.test/api/v1/area/publica/magno/manha", { method: "POST" }), { params: Promise.resolve({ org: "magno" }) });
}

describe("POST /manha", () => {
  it("⭐ sem plano nem Círculo: 403 e nenhuma chamada de IA", async () => {
    const r = await pedir();
    expect(r.status).toBe(403);
    expect(h.escrever).not.toHaveBeenCalled();
  });

  it("⭐ com o plano: escreve uma vez, com o céu dela, e grava a do dia sem pisar na que já existir", async () => {
    h.noPlano = true;
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(((await r.json()) as { data: unknown }).data).toEqual(MANHA);
    expect(h.escrever).toHaveBeenCalledTimes(1);
    const dados = (h.escrever.mock.calls[0]![2] as { dados: DadosDaManha }).dados;
    expect(dados.nascimento).toEqual(expect.objectContaining({ sol: "Touro" }));
    expect(dados.primeiroNome).toBe("Ana");
    const gravacao = h.chamadas.find(([t, m]) => t === "area_manhas" && m === "upsert");
    expect(gravacao?.[2]).toEqual([
      expect.objectContaining({ organization_id: "org-1", contact_id: "c-1", texto: MANHA }),
      { onConflict: "organization_id,contact_id,dia", ignoreDuplicates: true },
    ]);
  });

  it("⭐ a manhã do dia já gravada volta sem chamar a IA de novo", async () => {
    h.validoAte = new Date(Date.now() + 86_400_000).toISOString(); // no Círculo
    h.linhas.area_manhas = { texto: MANHA };
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(h.escrever).not.toHaveBeenCalled();
  });

  it("a IA sem resposta que sirva: 503 e nada gravado", async () => {
    h.noPlano = true;
    h.escrever.mockResolvedValue({ ok: false });
    const r = await pedir();
    expect(r.status).toBe(503);
    expect(h.chamadas.some(([t, m]) => t === "area_manhas" && m === "upsert")).toBe(false);
  });
});

describe("a manhã, pura", () => {
  const dados: DadosDaManha = {
    primeiroNome: "Ana",
    foco: "amor",
    carta: { nome: "A Estrela", mensagem: "Confie.", sentidoGeral: "Esperança." },
    nascimento: { sol: "Touro", lua: "Peixes", luaCerta: false },
    hoje: { dia: "2026-11-04", luaSigno: "Câncer", solSigno: "Escorpião", fase: "cheia" },
  };

  it("o pedido leva os signos de verdade, o foco e proíbe previsão", () => {
    const p = pedidoDaManha("Cigana", dados, "Fale com carinho.");
    for (const trecho of ["Sol em Touro", "Lua em Peixes", "Lua está em Câncer", "Lua cheia", "A Estrela", "Amor"]) expect(p).toContain(trecho);
    expect(p).toContain("não previsão");
    expect(p).toContain("signo vizinho");
  });

  it("sem nascimento, o pedido não inventa o signo dela", () => {
    expect(pedidoDaManha("Cigana", { ...dados, nascimento: null }, "x")).toContain("sem citar o signo dela");
  });

  it("⭐ resposta sem uma das três partes não vai à tela", () => {
    expect(lerManha(`ok ${JSON.stringify(MANHA)} fim`)).toEqual(MANHA);
    expect(lerManha(JSON.stringify({ ...MANHA, gesto: "" }))).toBeNull();
    expect(lerManha("não é json")).toBeNull();
    expect(manhaGravada({ carta: "a", energia: "b" })).toBeNull();
  });

  it("quem tem a manhã: o plano ou o Círculo", () => {
    expect(temAManha({ noPlano: false, noCirculo: false })).toBe(false);
    expect(temAManha({ noPlano: true, noCirculo: false })).toBe(true);
    expect(temAManha({ noPlano: false, noCirculo: true })).toBe(true);
  });
});

describe("a mão da semana do plano", () => {
  it("⭐ sem plano, não; com plano, uma por semana", async () => {
    const { maoDoPlanoLivre } = await import("@/lib/area-do-cliente/mao-servidor");
    const org = { id: "org-1", fuso: "America/Sao_Paulo" };
    expect(await maoDoPlanoLivre(adminFalso() as never, org, "c-1")).toBe(false);
    h.noPlano = true;
    expect(await maoDoPlanoLivre(adminFalso() as never, org, "c-1")).toBe(true);
    h.listas.area_maos = [{ pago_at: new Date().toISOString() }];
    expect(await maoDoPlanoLivre(adminFalso() as never, org, "c-1")).toBe(false);
  });
});
