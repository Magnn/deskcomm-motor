/**
 * OS CRÉDITOS da área do cliente (pedido do dono em 18/10/2026).
 *
 * O que este arquivo guarda:
 *  - o bônus do pacote e o custo em créditos (1 por real, arredondado para cima);
 *  - o aviso de pagamento credita o pacote pela função do banco, com referência do pagamento (reentrega não
 *    credita duas vezes) e evento só quando aplicou;
 *  - o Círculo dá os créditos do mês só quando a empresa ligou os créditos;
 *  - a leitura paga com créditos debita o custo certo e já volta paga; sem saldo, recusa e não deixa
 *    leitura pendurada;
 *  - a compra de pacote cobra o preço do pacote da configuração, nunca um valor vindo do corpo.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bonusDoPacote, creditosDoPreco, pacoteEmDestaque } from "@/lib/area-do-cliente/creditos";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  cobranca: vi.fn(),
  eventos: [] as Array<Record<string, unknown>>,
  chamadas: [] as Array<[string, string, unknown]>,
  settings: {} as Record<string, unknown>,
  config: {} as Record<string, unknown>,
}));

/** Um client de mentira: toda chamada encadeada fica registrada como [tabela, método, argumento]. */
function adminFalso() {
  return {
    rpc: h.rpc,
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const reg = (metodo: string) => (arg: unknown, ...resto: unknown[]) => {
        h.chamadas.push([tabela, metodo, resto.length ? [arg, ...resto] : arg]);
        return q;
      };
      for (const m of ["update", "delete", "eq", "is", "select", "not", "gte", "order", "limit"]) q[m] = reg(m);
      q.insert = (linha: unknown) => {
        h.chamadas.push([tabela, "insert", linha]);
        return { select: () => ({ single: async () => ({ data: { id: "33333333-3333-4333-8333-333333333333" }, error: null }) }) };
      };
      q.maybeSingle = async () => ({ data: tabela === "organizations" ? { settings: h.settings } : null, error: null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null, count: 0 });
      return q;
    },
  };
}

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({
  registrarEvento: vi.fn(async (_admin: unknown, e: Record<string, unknown>) => {
    h.eventos.push(e);
  }),
}));
vi.mock("@/lib/area-do-cliente/cobranca", () => ({ SemPagamento: class extends Error {}, criarCobrancaDaArea: h.cobranca }));
vi.mock("@/lib/area-do-cliente/leituras-servidor", async (importar) => ({
  ...(await importar<typeof import("@/lib/area-do-cliente/leituras-servidor")>()),
  pagasHoje: async () => 0,
  jaPagouNaModalidade: async () => false,
}));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: h.config },
    sessao: { contactId: "contato-1", sessaoId: "sessao-1" },
    admin: adminFalso(),
  }),
}));

beforeEach(() => {
  h.rpc.mockReset();
  h.cobranca.mockReset().mockResolvedValue({ forma: "pix", copiaECola: "000201", qrPng: null });
  h.eventos = [];
  h.chamadas = [];
  h.settings = {};
  h.config = { leituras: { ativo: true }, creditos: { ativo: true } };
});

describe("regras dos créditos", () => {
  it("bônus: o que vem além de 1 crédito por real", () => {
    expect(bonusDoPacote({ creditos: 30, preco_cents: 3000 })).toBe(0);
    expect(bonusDoPacote({ creditos: 70, preco_cents: 6000 })).toBe(10);
    expect(bonusDoPacote({ creditos: 130, preco_cents: 10000 })).toBe(30);
    expect(bonusDoPacote({ creditos: 10, preco_cents: 2000 })).toBe(0);
  });

  it("custo: 1 crédito por real, arredondado para cima", () => {
    expect(creditosDoPreco(500)).toBe(5);
    expect(creditosDoPreco(1490)).toBe(15);
    expect(creditosDoPreco(50)).toBe(1);
  });

  it("destaca o pacote do meio, não o maior", () => {
    expect(pacoteEmDestaque([{ creditos: 1, preco_cents: 100 }, { creditos: 2, preco_cents: 200 }, { creditos: 3, preco_cents: 300 }])).toBe(1);
    expect(pacoteEmDestaque([{ creditos: 1, preco_cents: 100 }])).toBe(-1);
  });
});

describe("o aviso de pagamento credita", () => {
  it("pacote: credita pela função do banco com a referência do pagamento, e registra o evento", async () => {
    h.rpc.mockResolvedValue({ data: [{ resultado: "aplicado", saldo: 70 }], error: null });
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(adminFalso() as never, "org-1", "contato-1", "pi_9", "creditos", { creditos: "70" }, "pix");
    expect(h.rpc).toHaveBeenCalledWith("fn_area_creditos_mover", {
      p_org: "org-1",
      p_contact: "contato-1",
      p_delta: 70,
      p_motivo: "pacote",
      p_referencia: "pagamento-pi_9",
    });
    expect(h.eventos).toEqual([expect.objectContaining({ tipo: "creditos_pagos", contactId: "contato-1" })]);
  });

  it("reentrega do aviso: a função diz 'repetido' e não há segundo evento", async () => {
    h.rpc.mockResolvedValue({ data: [{ resultado: "repetido", saldo: 70 }], error: null });
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(adminFalso() as never, "org-1", "contato-1", "pi_9", "creditos", { creditos: "70" }, "pix");
    expect(h.eventos).toEqual([]);
  });

  it("quantidade inválida nos metadados: não credita nada", async () => {
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    for (const creditos of ["0", "-5", "1.5", "abc", "999999"]) {
      await liberarCompraDaArea(adminFalso() as never, "org-1", "contato-1", "pi_9", "creditos", { creditos }, "pix");
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("Círculo: os créditos do mês só com os créditos ligados na empresa", async () => {
    h.rpc.mockResolvedValue({ data: [{ resultado: "aplicado", saldo: 30 }], error: null });
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");

    h.settings = { area: { ativo: true } };
    await liberarCompraDaArea(adminFalso() as never, "org-1", "contato-1", "pi_c1", "circulo", {}, "pix");
    expect(h.rpc).not.toHaveBeenCalled();

    h.settings = { area: { ativo: true, creditos: { ativo: true, circulo_mensal: 30 } } };
    await liberarCompraDaArea(adminFalso() as never, "org-1", "contato-1", "pi_c1", "circulo", {}, "pix");
    expect(h.rpc).toHaveBeenCalledWith("fn_area_creditos_mover", expect.objectContaining({ p_delta: 30, p_motivo: "circulo", p_referencia: "circulo-pi_c1" }));
  });
});

async function postar(rota: "leituras" | "creditos", corpo: unknown) {
  const mod =
    rota === "leituras"
      ? await import("@/app/api/v1/area/publica/[org]/leituras/route")
      : await import("@/app/api/v1/area/publica/[org]/creditos/route");
  const res = await mod.POST(
    new NextRequest(`https://area.test/api/v1/area/publica/magno/${rota}`, { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ org: "magno" }) },
  );
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string } } };
}

describe("leitura paga com créditos", () => {
  it("debita o custo da leitura e já volta paga, sem cobrança", async () => {
    h.rpc.mockResolvedValue({ data: [{ resultado: "aplicado", saldo: 25 }], error: null });
    const r = await postar("leituras", { modalidade: "tarot", pergunta: "Vou conseguir o emprego?", forma: "creditos" });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ paga: true, creditos: 5, saldo: 25 });
    expect(h.rpc).toHaveBeenCalledWith(
      "fn_area_creditos_mover",
      expect.objectContaining({ p_delta: -5, p_motivo: "leitura", p_referencia: "leitura-33333333-3333-4333-8333-333333333333" }),
    );
    expect(h.cobranca).not.toHaveBeenCalled();
    expect(h.chamadas).toContainEqual(["area_leituras", "update", expect.objectContaining({ pagamento: "creditos" })]);
    expect(h.eventos).toContainEqual(expect.objectContaining({ tipo: "leitura_paga" }));
  });

  it("sem saldo: 402, e a leitura que não foi paga é apagada", async () => {
    h.rpc.mockResolvedValue({ data: [{ resultado: "sem_saldo", saldo: 2 }], error: null });
    const r = await postar("leituras", { modalidade: "tarot", pergunta: "Vou conseguir o emprego?", forma: "creditos" });
    expect(r.status).toBe(402);
    expect(r.json.error?.code).toBe("sem_saldo");
    expect(h.chamadas).toContainEqual(["area_leituras", "delete", undefined]);
    expect(h.eventos).toEqual([]);
  });

  it("créditos desligados: não aceita pagar com créditos", async () => {
    h.config = { leituras: { ativo: true } };
    const r = await postar("leituras", { modalidade: "tarot", pergunta: "Vou conseguir o emprego?", forma: "creditos" });
    expect(r.status).toBe(422);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /creditos", () => {
  it("cobra o preço do pacote da configuração e leva a quantidade nos metadados", async () => {
    const r = await postar("creditos", { pacote: 1, forma: "pix" });
    expect(r.status).toBe(200);
    expect(h.cobranca).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ valorCentavos: 6000, extra: "creditos", metadados: { creditos: "70" } }),
    );
    expect(h.eventos).toContainEqual(expect.objectContaining({ tipo: "creditos_checkout" }));
  });

  it("pacote que não existe ou valor no corpo: recusa", async () => {
    h.config = { creditos: { ativo: true, pacotes: [{ creditos: 10, preco_cents: 1000 }] } };
    expect((await postar("creditos", { pacote: 2, forma: "pix" })).status).toBe(422);
    expect((await postar("creditos", { pacote: 0, forma: "pix", preco_cents: 1 })).status).toBe(422);
    expect(h.cobranca).not.toHaveBeenCalled();
  });

  it("créditos desligados: a carteira não existe", async () => {
    h.config = {};
    expect((await postar("creditos", { pacote: 0, forma: "pix" })).status).toBe(404);
  });
});
