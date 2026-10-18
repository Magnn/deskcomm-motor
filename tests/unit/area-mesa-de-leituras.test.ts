/**
 * A MESA DE LEITURAS da área do cliente (pedido do dono em 18/10/2026).
 *
 * O que este arquivo guarda:
 *  - preço: a primeira PAGA de cada modalidade sai pelo preço de entrada, as seguintes pelo normal;
 *  - limite por dia: R$ 5 repetível não vira caça-níquel;
 *  - sorteio: três cartas distintas, cada uma com a sua posição, decididas pelo servidor;
 *  - a resposta da IA só serve com três cartas, síntese e passo;
 *  - o aviso de pagamento libera a leitura certa, da pessoa certa, uma vez;
 *  - a rota recusa quando o limite do dia acabou, e cobra o preço certo.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BARALHO_CIGANO } from "@/lib/area-do-cliente/baralho-cigano";
import { POSICOES, cabeHoje, precoDaLeitura, sortearCartas } from "@/lib/area-do-cliente/leituras";
import { lerLeitura } from "@/lib/area-do-cliente/leituras-ia";

describe("regras da Mesa", () => {
  const cfg = { preco_primeira_cents: 500, preco_cents: 1490 };

  it("primeira de cada modalidade pelo preço de entrada; as seguintes pelo normal", () => {
    expect(precoDaLeitura(cfg, false)).toBe(500);
    expect(precoDaLeitura(cfg, true)).toBe(1490);
  });

  it("o limite do dia conta as pagas", () => {
    expect(cabeHoje(0, 3)).toBe(true);
    expect(cabeHoje(2, 3)).toBe(true);
    expect(cabeHoje(3, 3)).toBe(false);
  });

  it("sorteia três cartas distintas, na ordem das posições", () => {
    for (let rodada = 0; rodada < 50; rodada++) {
      const cartas = sortearCartas("baralho-cigano");
      expect(cartas.map((c) => c.posicao)).toEqual([...POSICOES]);
      expect(new Set(cartas.map((c) => c.id)).size).toBe(3);
      for (const c of cartas) expect(BARALHO_CIGANO.some((b) => b.id === c.id && b.nome === c.nome)).toBe(true);
    }
    expect(sortearCartas("tarot")).toHaveLength(3);
  });

  it("o sorteio vem do aleatório do servidor, não de quem escolhe na mesa", () => {
    const sempreZero = () => 0;
    expect(sortearCartas("baralho-cigano", sempreZero).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("a resposta da IA só serve com três cartas, síntese e passo", () => {
    const boa = '{"cartas": ["a", "b", "c"], "sintese": "junta", "passo": "faça"}';
    expect(lerLeitura(`texto antes ${boa} depois`)).toEqual({ cartas: ["a", "b", "c"], sintese: "junta", passo: "faça" });
    expect(lerLeitura('{"cartas": ["a", "b"], "sintese": "x", "passo": "y"}')).toBeNull();
    expect(lerLeitura('{"cartas": ["a", "b", "c"], "sintese": "x"}')).toBeNull();
    expect(lerLeitura("sem json")).toBeNull();
  });
});

describe("o aviso de pagamento libera a leitura", () => {
  it("marca paga só a leitura daquela pessoa e daquela empresa, e só se ainda não estava paga", async () => {
    const filtros: Array<[string, unknown]> = [];
    const eventos: unknown[] = [];
    const q: Record<string, unknown> = {};
    q.update = (patch: unknown) => {
      filtros.push(["update", patch]);
      return q;
    };
    q.eq = (c: string, v: unknown) => {
      filtros.push([c, v]);
      return q;
    };
    q.is = (c: string, v: unknown) => {
      filtros.push([`is:${c}`, v]);
      return q;
    };
    q.select = async () => ({ data: [{ modalidade: "tarot" }], error: null });
    q.insert = async (e: unknown) => {
      eventos.push(e);
      return { error: null };
    };
    const admin = { from: () => q } as never;
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    const id = "11111111-1111-4111-8111-111111111111";
    await liberarCompraDaArea(admin, "org-1", "contato-1", "pi_1", "leitura", { leitura_id: id }, "pix");
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["id", id],
        ["organization_id", "org-1"],
        ["contact_id", "contato-1"],
        ["is:pago_at", null],
      ]),
    );
    const { registrarEvento } = await import("@/lib/area-do-cliente/eventos");
    expect(registrarEvento).toHaveBeenCalledWith(admin, expect.objectContaining({ tipo: "leitura_paga", contactId: "contato-1" }));
    expect(eventos).toEqual([]);
  });

  it("sem leitura_id válido não faz nada", async () => {
    const admin = { from: vi.fn() } as never;
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(admin, "org-1", "contato-1", "pi_1", "leitura", { leitura_id: "x" }, "pix");
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});

const h = vi.hoisted(() => ({
  pagasHoje: 0,
  jaPagou: false,
  cobranca: vi.fn(),
  inseridas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: vi.fn(async () => undefined) }));
vi.mock("@/lib/area-do-cliente/cobranca", () => ({
  SemPagamento: class extends Error {},
  criarCobrancaDaArea: h.cobranca,
}));
vi.mock("@/lib/area-do-cliente/leituras-servidor", async (importar) => ({
  ...(await importar<typeof import("@/lib/area-do-cliente/leituras-servidor")>()),
  pagasHoje: async () => h.pagasHoje,
  jaPagouNaModalidade: async () => h.jaPagou,
}));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: { leituras: { ativo: true } } },
    sessao: { contactId: "contato-1", sessaoId: "sessao-1" },
    admin: {
      from: () => ({
        insert: (linha: Record<string, unknown>) => {
          h.inseridas.push(linha);
          return { select: () => ({ single: async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }) }) };
        },
      }),
    },
  }),
}));

async function pedir(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/leituras/route");
  const res = await POST(
    new NextRequest("https://area.test/api/v1/area/publica/magno/leituras", { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ org: "magno" }) },
  );
  return { status: res.status, json: (await res.json()) as { data?: { preco_cents: number }; error?: { code: string } } };
}

describe("POST /leituras", () => {
  beforeEach(() => {
    h.pagasHoje = 0;
    h.jaPagou = false;
    h.inseridas = [];
    h.cobranca.mockReset().mockResolvedValue({ forma: "pix", copiaECola: "000201...", qrPng: null });
  });

  it("primeira leitura da modalidade: R$ 5, com a leitura nos metadados e o extra da Mesa", async () => {
    const r = await pedir({ modalidade: "baralho-cigano", pergunta: "Vou mudar de emprego?", forma: "pix" });
    expect(r.status).toBe(200);
    expect(r.json.data?.preco_cents).toBe(500);
    expect(h.inseridas[0]).toMatchObject({ modalidade: "baralho-cigano", preco_cents: 500, contact_id: "contato-1" });
    expect(h.cobranca).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ valorCentavos: 500, extra: "leitura", metadados: expect.objectContaining({ leitura_id: "22222222-2222-4222-8222-222222222222" }) }),
    );
  });

  it("quem já pagou nesta modalidade paga o preço normal", async () => {
    h.jaPagou = true;
    const r = await pedir({ modalidade: "tarot", pergunta: "Ele vai voltar?", forma: "pix" });
    expect(r.json.data?.preco_cents).toBe(1490);
  });

  it("acabou o limite do dia: recusa sem criar leitura nem cobrança", async () => {
    h.pagasHoje = 3;
    const r = await pedir({ modalidade: "tarot", pergunta: "Mais uma pergunta?", forma: "pix" });
    expect(r.status).toBe(429);
    expect(r.json.error?.code).toBe("limite_do_dia");
    expect(h.inseridas).toHaveLength(0);
    expect(h.cobranca).not.toHaveBeenCalled();
  });

  it("modalidade inexistente ou pergunta vazia: recusa", async () => {
    expect((await pedir({ modalidade: "buzios", pergunta: "Algo?", forma: "pix" })).status).toBe(422);
    expect((await pedir({ modalidade: "tarot", pergunta: " ", forma: "pix" })).status).toBe(422);
  });
});
