import { describe, expect, it } from "vitest";

import { blocoDoCombinado } from "@/lib/followup/bloco-do-combinado";

import { blocoDaEntradaImediata } from "./bloco-da-entrada";
import { entradaImediata } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

// A escada da Cigana em 09/11/2026: R$ 130 de venda, degraus 100/60/50, entrada mínima de R$ 10.
const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({ enabled: true, list_price_cents: 13000, min_down_payment_cents: 1000, steps: [link(10000), link(6000), link(5000)] });
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });

// Caso de 09/11/2026: combinado para quarta, o preço foi dito dias antes (fora da janela de mensagens).
const CONVERSA = [
  m("inbound", "Boa tarde"),
  m("outbound", "Boa tarde, meu bem. Que bom te ver por aqui. Se quiser falar do combinado de quarta, eu tô aqui."),
  m("outbound", "Como tá sendo o seu dia hoje?"),
  m("inbound", "Sonhei com uma cobra enorme"),
  m("inbound", "Em baixo da minha cama"),
  m("inbound", "Tenho 30 hoje"),
];

describe("entrada com combinado de data — 09/11/2026", () => {
  it("⭐ 'tenho 30 hoje' com o preço fora da janela vira entrada sobre o valor combinado", () => {
    expect(entradaImediata(PRICING, CONVERSA, 6000)).toEqual({ entradaCents: 3000, restanteCents: 3000 });
    expect(entradaImediata(PRICING, CONVERSA, 13000)).toEqual({ entradaCents: 3000, restanteCents: 10000 });
  });

  it("sem combinado e sem preço na janela continua não sendo entrada", () => {
    expect(entradaImediata(PRICING, CONVERSA)).toBeNull();
    expect(entradaImediata(PRICING, CONVERSA, null)).toBeNull();
  });

  it("com preço na janela, o combinado não muda nada", () => {
    const comPreco = [m("outbound", "Aqui o seu trabalho completo é *R$ 130*, uma vez só."), m("inbound", "Só tenho 50 hoje")];
    expect(entradaImediata(PRICING, comPreco, 6000)).toEqual(entradaImediata(PRICING, comPreco));
  });

  it("o retorno combinado manda aceitar a parte de hoje, e a entrada vence o retorno", () => {
    const agora = new Date("2026-11-09T19:51:00Z");
    const bloco = blocoDoCombinado({ quando: "2026-11-11T17:00:00Z", promessa: "Enviar o link de R$ 60" } as never, agora, "America/Sao_Paulo");
    expect(bloco).toContain("UMA PARTE hoje");
    expect(bloco).toContain("NUNCA responda que hoje não precisa pagar");
    expect(blocoDaEntradaImediata({ entradaCents: 3000, restanteCents: 3000 })).toContain("VENCE O BLOCO DE PREÇO E O RETORNO COMBINADO");
  });
});
