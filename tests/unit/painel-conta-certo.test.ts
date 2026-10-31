/**
 * O PAINEL CONTA O QUE ACONTECEU (medido em 31/10/2026: 996 atendidos contra 3.576 no banco, um ajuste de
 * R$ 130 ignorado e 55 cobranças avulsas contadas como vendas).
 */
import { describe, expect, it, vi } from "vitest";

import { lerTodasAsLinhas } from "@/lib/resultado/ler-todas-as-linhas";
import { vendasDoLedger, type LinhaDoLedger } from "@/lib/resultado/vendas-do-pagamento";

const cobranca = (id: string, cents: number, metadata: LinhaDoLedger["metadata"] = {}): LinhaDoLedger => ({
  id,
  event_type: "charge",
  amount_cents: cents,
  occurred_at: "2026-10-15T01:00:00.000Z",
  contact_id: "contato",
  external_event_id: `ev-${id}`,
  metadata,
});

describe("as linhas em páginas", () => {
  it("passa das 1.000 linhas que a REST entrega por pedido", async () => {
    const pedir = vi.fn(async (de: number, ate: number) => {
      const total = 2500;
      const fim = Math.min(ate + 1, total);
      return { data: Array.from({ length: Math.max(fim - de, 0) }, (_, i) => de + i), error: null };
    });
    const linhas = await lerTodasAsLinhas<number>(pedir);
    expect(linhas).toHaveLength(2500);
    expect(new Set(linhas).size).toBe(2500);
    expect(pedir).toHaveBeenCalledTimes(3);
  });

  it("erro em qualquer página aparece, sem devolver metade", async () => {
    await expect(lerTodasAsLinhas(async () => ({ data: null, error: { message: "fora" } }))).rejects.toThrow("fora");
  });
});

describe("as vendas do livro", () => {
  it("o ajuste que anula a cobrança tira a venda", () => {
    const v = vendasDoLedger([cobranca("a", 13000), cobranca("b", 13000)], new Set(), new Map([["b", -13000]]));
    expect(v.map((x) => x.id)).toEqual(["a"]);
  });

  it("o ajuste parcial reduz o valor", () => {
    expect(vendasDoLedger([cobranca("a", 13000)], new Set(), new Map([["a", -3000]]))[0]!.total_cents).toBe(10000);
  });

  it("a cobrança avulsa vem marcada, e a principal não", () => {
    const v = vendasDoLedger([cobranca("a", 500, { extra: "pergunta-nova" }), cobranca("b", 13000)], new Set());
    expect(v.map((x) => x.extra)).toEqual([true, false]);
  });

  it("a estornada continua fora", () => {
    expect(vendasDoLedger([cobranca("a", 13000)], new Set(["ev-a"]))).toEqual([]);
  });
});
