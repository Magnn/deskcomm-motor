/**
 * AS SIMPATIAS DA ÁREA e a CONTRIBUIÇÃO (pedido do dono em 19/10/2026; migration 0941).
 *
 * O que este arquivo guarda:
 *  - o passo a passo é de quem está no Círculo só quando a empresa liga o Círculo E pede isso;
 *  - o pedido "o templo faz por mim" cobra o preço da CONFIGURAÇÃO (nunca do corpo), só de simpatia publicada
 *    da própria organização, e leva o id do pedido nos metadados;
 *  - o aviso de pagamento marca o pedido como pago uma vez só, filtrado por organização e pessoa;
 *  - a contribuição recusa valor abaixo do mínimo ou acima do teto, e não libera nada;
 *  - nenhum texto da área promete resultado.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTRIBUICAO_MAXIMA_CENTS,
  estadoDoPedido,
  simpatiaParcialSchema,
  simpatiaSchema,
  valorDaContribuicaoValido,
  vePassoAPasso,
} from "@/lib/area-do-cliente/simpatias";

const h = vi.hoisted(() => ({
  cobranca: vi.fn(),
  config: {} as Record<string, unknown>,
  simpatia: { id: "22222222-2222-4222-8222-222222222222", titulo: "Pote de mel" } as { id: string; titulo: string } | null,
  filtrosDaSimpatia: [] as Array<[string, unknown]>,
  pedidos: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: vi.fn(async () => undefined) }));
vi.mock("@/lib/area-do-cliente/cobranca", () => ({ SemPagamento: class extends Error {}, criarCobrancaDaArea: h.cobranca }));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: h.config },
    sessao: { contactId: "contato-1", sessaoId: "sessao-1" },
    admin: {
      from: (tabela: string) => {
        if (tabela === "area_simpatias") {
          const q: Record<string, unknown> = {};
          q.select = () => q;
          q.eq = (c: string, v: unknown) => (h.filtrosDaSimpatia.push([c, v]), q);
          q.maybeSingle = async () => ({ data: h.simpatia, error: null });
          return q;
        }
        return {
          insert: (linha: Record<string, unknown>) => {
            h.pedidos.push(linha);
            return { select: () => ({ single: async () => ({ data: { id: "33333333-3333-4333-8333-333333333333" }, error: null }) }) };
          },
        };
      },
    },
  }),
}));

beforeEach(() => {
  h.cobranca.mockReset();
  h.cobranca.mockResolvedValue({ forma: "pix", copiaECola: "000201", qrPng: null });
  h.config = { simpatias: { ativo: true, preco_feita_cents: 2700, so_assinantes: true }, contribuicao: { ativo: true, minimo_cents: 500 } };
  h.simpatia = { id: "22222222-2222-4222-8222-222222222222", titulo: "Pote de mel" };
  h.filtrosDaSimpatia = [];
  h.pedidos = [];
});

describe("regras das simpatias", () => {
  it("passo a passo: só o Círculo vê quando a empresa liga o Círculo e pede; nos outros casos, todos", () => {
    expect(vePassoAPasso({ so_assinantes: true }, true, false)).toBe(false);
    expect(vePassoAPasso({ so_assinantes: true }, true, true)).toBe(true);
    expect(vePassoAPasso({ so_assinantes: false }, true, false)).toBe(true);
    // Sem o Círculo ligado não há como assinar: esconder seria esconder de todo mundo.
    expect(vePassoAPasso({ so_assinantes: true }, false, false)).toBe(true);
  });

  it("estado do pedido: aguardando pagamento → a fazer → feita", () => {
    expect(estadoDoPedido({ pago_at: null, feita_at: null })).toBe("aguardando_pagamento");
    expect(estadoDoPedido({ pago_at: "2026-10-19T20:00:00Z", feita_at: null })).toBe("a_fazer");
    expect(estadoDoPedido({ pago_at: "2026-10-19T20:00:00Z", feita_at: "2026-10-20T01:00:00Z" })).toBe("feita");
  });

  it("contribuição: inteira, entre o mínimo da empresa e o teto", () => {
    expect(valorDaContribuicaoValido(500, 500)).toBe(true);
    expect(valorDaContribuicaoValido(499, 500)).toBe(false);
    expect(valorDaContribuicaoValido(CONTRIBUICAO_MAXIMA_CENTS + 1, 500)).toBe(false);
    expect(valorDaContribuicaoValido(1000.5, 500)).toBe(false);
  });

  it("simpatia exige título, intenção e passo a passo; a edição parcial não reaplica os padrões", () => {
    expect(simpatiaSchema.safeParse({ titulo: "X", intencao: "Y", passos: "" }).success).toBe(false);
    expect(simpatiaSchema.parse({ titulo: "X", intencao: "Y", passos: "Z" }).publicada).toBe(true);
    expect(simpatiaParcialSchema.parse({ titulo: "Novo" })).toEqual({ titulo: "Novo" });
  });
});

async function pedir(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/simpatias/route");
  const res = await POST(new NextRequest("https://area.test/api/v1/area/publica/magno/simpatias", { method: "POST", body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ org: "magno" }),
  });
  return res.status;
}

describe("POST /simpatias — o templo faz por mim", () => {
  it("⭐ cobra o preço da configuração (não o do corpo), da simpatia publicada da organização, com o pedido nos metadados", async () => {
    const status = await pedir({ simpatia_id: "22222222-2222-4222-8222-222222222222", forma: "pix", para_quem: "harmonia em casa" });
    expect(status).toBe(200);
    expect(h.filtrosDaSimpatia).toEqual(expect.arrayContaining([["organization_id", "org-1"], ["publicada", true]]));
    expect(h.pedidos[0]).toMatchObject({ organization_id: "org-1", contact_id: "contato-1", titulo: "Pote de mel", para_quem: "harmonia em casa", valor_cents: 2700 });
    expect(h.cobranca).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        valorCentavos: 2700,
        extra: "simpatia",
        referencia: "simpatia-33333333-3333-4333-8333-333333333333",
        metadados: { pedido_id: "33333333-3333-4333-8333-333333333333" },
      }),
    );
  });

  it("corpo com preço é recusado (o schema é estrito)", async () => {
    expect(await pedir({ simpatia_id: "22222222-2222-4222-8222-222222222222", forma: "pix", valor_cents: 100 })).toBe(422);
    expect(h.cobranca).not.toHaveBeenCalled();
  });

  it("simpatia que não é publicada da organização: 404, sem pedido nem cobrança", async () => {
    h.simpatia = null;
    expect(await pedir({ simpatia_id: "22222222-2222-4222-8222-222222222222", forma: "pix" })).toBe(404);
    expect(h.pedidos).toEqual([]);
    expect(h.cobranca).not.toHaveBeenCalled();
  });

  it("simpatias desligadas na empresa: 404", async () => {
    h.config = {};
    expect(await pedir({ simpatia_id: "22222222-2222-4222-8222-222222222222", forma: "pix" })).toBe(404);
  });
});

describe("POST /contribuicao", () => {
  async function contribuir(corpo: unknown) {
    const { POST } = await import("@/app/api/v1/area/publica/[org]/contribuicao/route");
    const res = await POST(new NextRequest("https://area.test/x", { method: "POST", body: JSON.stringify(corpo) }), { params: Promise.resolve({ org: "magno" }) });
    return res.status;
  }

  it("cobra o valor escolhido a partir do mínimo, como contribuição", async () => {
    expect(await contribuir({ forma: "pix", valor_cents: 1500 })).toBe(200);
    expect(h.cobranca).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ valorCentavos: 1500, extra: "contribuicao" }));
  });

  it("abaixo do mínimo ou desligada: recusa sem cobrar", async () => {
    expect(await contribuir({ forma: "pix", valor_cents: 300 })).toBe(422);
    h.config = {};
    expect(await contribuir({ forma: "pix", valor_cents: 1500 })).toBe(404);
    expect(h.cobranca).not.toHaveBeenCalled();
  });
});

describe("o aviso de pagamento", () => {
  it("⭐ marca o pedido como pago uma vez só, filtrado por organização e pessoa", async () => {
    const filtros: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {};
    q.update = (patch: unknown) => (filtros.push(["update", patch]), q);
    q.eq = (c: string, v: unknown) => (filtros.push([c, v]), q);
    q.is = (c: string, v: unknown) => (filtros.push([`is:${c}`, v]), q);
    q.select = async () => ({ data: [{ titulo: "Pote de mel" }], error: null });
    const admin = { from: () => q } as never;
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    const id = "33333333-3333-4333-8333-333333333333";
    await liberarCompraDaArea(admin, "org-1", "contato-1", "pi_9", "simpatia", { pedido_id: id }, "pix");
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["id", id],
        ["organization_id", "org-1"],
        ["contact_id", "contato-1"],
        ["is:pago_at", null],
      ]),
    );
    const { registrarEvento } = await import("@/lib/area-do-cliente/eventos");
    expect(registrarEvento).toHaveBeenCalledWith(admin, expect.objectContaining({ tipo: "simpatia_paga" }));
  });

  it("contribuição não libera nada além do rastro", async () => {
    const admin = { from: vi.fn() } as never;
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(admin, "org-1", "contato-1", "pi_8", "contribuicao", {}, "pix");
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});

describe("nenhum texto promete resultado", () => {
  it("os textos das simpatias e da contribuição", async () => {
    const { textosDasSimpatias } = await import("@/app/c/[org]/_textos");
    const textos = Object.values(textosDasSimpatias((s) => s)).join(" ");
    expect(textos).not.toMatch(/garant|vai voltar|volta em|com certeza|resultado garantido|100%/i);
    expect(textos).toMatch(/não muda o seu atendimento/);
    expect(textos).toMatch(/não uma promessa de resultado/);
  });
});
