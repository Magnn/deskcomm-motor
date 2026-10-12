import { describe, expect, it } from "vitest";

import { blocoDaEntrada } from "./bloco-da-entrada";
import { entradaComRestante } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13000,
  steps: [link(10000), link(9000), link(8000), link(7000), link(6000), link(5000)],
});
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });
const PRECO = m("outbound", "O trabalho custa R$ 130, pagamento único.");

describe("entradaComRestante", () => {
  it("⭐ o caso medido: 'tenho apenas 50 reais' e depois 'posso te mandar o restante dia 30'", () => {
    const conversa = [
      PRECO,
      m("inbound", "Desculpa não tenho esse valor"),
      m("inbound", "Tenho apenas 50 reais"),
      m("outbound", "Esse valor de R$ 130 hoje não cabe de jeito nenhum pra você?"),
      m("inbound", "Se vc confiar posso te mandar o restante dia 30"),
    ];
    expect(entradaComRestante(PRICING, conversa)).toEqual({ entradaCents: 5000, restanteCents: 8000 });
  });

  it("a entrada é o maior degrau que cabe no que ela tem, e o restante fecha o valor de venda", () => {
    const com = (texto: string) => entradaComRestante(PRICING, [PRECO, m("inbound", texto)]);
    expect(com("tenho 75 reais hoje e o resto dia 10")).toEqual({ entradaCents: 7000, restanteCents: 6000 });
    expect(com("consigo 80 agora, o restante dia 5")).toEqual({ entradaCents: 8000, restanteCents: 5000 });
    // 100 hoje deixaria 30 de restante, que não é degrau: a maior entrada que fecha é 80.
    expect(com("tenho 100 hoje e o resto dia 20")).toEqual({ entradaCents: 8000, restanteCents: 5000 });
  });

  it("sem data, sem valor, ou com menos que o menor degrau: não é entrada (a escada de sempre segue)", () => {
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "Tenho apenas 50 reais")])).toBeNull();
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "só recebo dia 30")])).toBeNull();
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "tenho 20 reais hoje e o resto dia 30")])).toBeNull();
    expect(entradaComRestante(PRICING, [m("inbound", "tenho 50 reais e o resto dia 30")])).toBeNull(); // preço ainda não dito
  });
});

describe("blocoDaEntrada", () => {
  it("⭐ manda aceitar, traz o link DO VALOR DA ENTRADA e o restante dito por último", () => {
    const bloco = blocoDaEntrada(PRICING, { entradaCents: 5000, restanteCents: 8000 });
    expect(bloco).toContain("https://pay.exemplo.com.br/v5000");
    expect(bloco).not.toContain("https://pay.exemplo.com.br/v8000");
    expect(bloco).toMatch(/entra com R\$\s?50[^.]*restante de R\$\s?80/);
    expect(bloco).toContain("agendar retorno");
  });

  it("sem entrada, ou sem link para o valor, o bloco não existe", () => {
    expect(blocoDaEntrada(PRICING, null)).toBe("");
    expect(blocoDaEntrada(PRICING, { entradaCents: 4000, restanteCents: 9000 })).toBe("");
    expect(blocoDaEntrada(null, { entradaCents: 5000, restanteCents: 8000 })).toBe("");
  });
});
