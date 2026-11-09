import { describe, expect, it } from "vitest";

import { entradaImediata } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({ enabled: true, list_price_cents: 13000, min_down_payment_cents: 1000, steps: [link(10000), link(6000), link(5000)] });
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });

// Caso de 09/11/2026: "só posso fazer o Pix de 30, o restante no final do mês" — a agente fechou por conta própria e a chave nunca saiu.
const CONVERSA = [
  m("outbound", "Aquele combinado ainda está de pé: você não precisa pagar os R$ 130 de uma vez. Me diz quanto cabe hoje e eu já te mando a chave. Quanto você consegue colocar agora?"),
  m("inbound", "Acabei de passar mensagem pra ele perguntando se ele sente a minha falta ele disse que não."),
  m("outbound", "É esse nó que a gente desata no trabalho."),
  m("inbound", "Mas como faço para te pagar. Só posso te fazer o Pix de 30. O restante posso te fazer no final do mês"),
  m("inbound", "Os 100 reais"),
];

describe("entrada de R$ 30 com restante no fim do mês — 09/11/2026", () => {
  it("⭐ o valor do restante, no balão seguinte, não vira a entrada", () => {
    expect(entradaImediata(PRICING, CONVERSA)).toEqual({ entradaCents: 3000, restanteCents: 10000 });
  });

  it("na mesma frase, o valor depois de 'restante' também não vira a entrada", () => {
    const umaFrase = [...CONVERSA.slice(0, 3), m("inbound", "Tenho 30 hoje e o restante 100 no final do mês")];
    expect(entradaImediata(PRICING, umaFrase)).toEqual({ entradaCents: 3000, restanteCents: 10000 });
  });

  it("'o restante pago depois, hoje tenho 40' continua lendo o 40", () => {
    const hoje = [...CONVERSA.slice(0, 3), m("inbound", "O restante pago depois"), m("inbound", "hoje tenho 40")];
    expect(entradaImediata(PRICING, hoje)).toEqual({ entradaCents: 4000, restanteCents: 9000 });
  });
});
