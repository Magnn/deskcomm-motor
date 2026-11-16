import { describe, expect, it } from "vitest";

import { entradaImediata } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

// A escada da Cigana: R$ 130 de venda, degraus 100/60/50, entrada mínima de R$ 10.
const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({ enabled: true, list_price_cents: 13000, min_down_payment_cents: 1000, steps: [link(10000), link(6000), link(5000)] });
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });

// Felipe, 16/11/2026: a oferta saiu sem o número, e a resposta foi "tenho 20 reais".
const CONVERSA = [
  m("inbound", "2 11 21"),
  m("outbound", "CARTA 1: O Sol (carta número 2 da mesa)."),
  m("inbound", "Iria correndo para os braços dela"),
  m("outbound", "É um valor só, sem mensalidade, e eu fico do seu lado. Você quer que eu firme o seu nome e o dela no altar?"),
  m("inbound", "No momento desempregado e tenho 20 reais"),
];

describe("entrada quando o preço nunca foi dito — 16/11/2026", () => {
  it("⭐ 'tenho 20 reais' sem preço dito vira entrada de R$ 20 sobre o valor de venda", () => {
    expect(entradaImediata(PRICING, CONVERSA, PRICING.list_price_cents)).toEqual({ entradaCents: 2000, restanteCents: 11000 });
  });

  it("sem a referência (quem já ouviu preço fora da janela) segue não sendo entrada", () => {
    expect(entradaImediata(PRICING, CONVERSA, null)).toBeNull();
  });

  it("os números das cartas não viram entrada", () => {
    expect(entradaImediata(PRICING, CONVERSA.slice(0, 1), PRICING.list_price_cents)).toBeNull();
  });
});
