import { describe, expect, it } from "vitest";

import { blocoDosExtras, totaisDoExtra, valorDaCobranca } from "./extras";
import { pricingSchema, type Extra } from "./tipos";
import { quantidadeMenorQueACombinada, valorErradoDeExtra } from "./valor-do-extra";

const PERGUNTA: Extra = {
  name: "Pergunta nova",
  price_cents: 700,
  when: "a pessoa pede outra pergunta depois da leitura.",
  quantity_prices: [
    { quantity: 2, price_cents: 1000 },
    { quantity: 3, price_cents: 1500 },
    { quantity: 4, price_cents: 1700 },
  ],
};
const SEM_TABELA: Extra = { name: "Pergunta nova", price_cents: 500, when: "a pessoa pede outra pergunta." };

describe("preço fechado por quantidade", () => {
  it("cobra o valor da tabela e, acima dela, soma os grupos", () => {
    expect([1, 2, 3, 4].map((q) => valorDaCobranca(PERGUNTA, q))).toEqual([700, 1000, 1500, 1700]);
    expect(valorDaCobranca(PERGUNTA, 5)).toBe(2400);
    expect(valorDaCobranca(PERGUNTA, 6)).toBe(2700);
    expect(valorDaCobranca(PERGUNTA, 8)).toBe(3400);
    expect(valorDaCobranca(PERGUNTA, 10)).toBe(4400);
  });

  it("sem tabela continua o unitário vezes a quantidade", () => {
    expect(valorDaCobranca(SEM_TABELA, 3)).toBe(1500);
    expect(totaisDoExtra(SEM_TABELA)).toHaveLength(10);
  });

  it("a configuração guarda a tabela", () => {
    const salvo = pricingSchema.safeParse({ enabled: true, list_price_cents: 6000, steps: [], extras: [PERGUNTA] });
    expect(salvo.success).toBe(true);
    if (salvo.success) expect(salvo.data.extras?.[0]?.quantity_prices).toEqual(PERGUNTA.quantity_prices);
  });

  it("o bloco do turno manda mostrar as opções e não fala em quantidade vezes valor", () => {
    const bloco = blocoDosExtras([PERGUNTA]);
    expect(bloco).toContain("1 = R$ 7, 2 = R$ 10, 3 = R$ 15, 4 = R$ 17");
    expect(bloco).not.toContain("Não existe pacote");
  });

  it("aceita o valor certo de cada quantidade e a lista de opções", () => {
    expect(valorErradoDeExtra("Duas perguntas ficam R$ 10.", [PERGUNTA])).toBeNull();
    expect(valorErradoDeExtra("As 3 perguntas ficam R$ 15.", [PERGUNTA])).toBeNull();
    expect(valorErradoDeExtra("Uma pergunta é R$ 7, 2 perguntas R$ 10, 3 perguntas R$ 15 e 4 perguntas R$ 17.", [PERGUNTA])).toBeNull();
    expect(valorErradoDeExtra("Fica R$ 10 no total.\n\n[[PIX: Pergunta nova x2]]", [PERGUNTA])).toBeNull();
  });

  it("recusa o valor que não é o da quantidade", () => {
    expect(valorErradoDeExtra("Duas perguntas ficam R$ 14.", [PERGUNTA])).toContain("R$ 10");
    expect(valorErradoDeExtra("A pergunta é R$ 5.", [PERGUNTA])).toContain("R$ 5");
    expect(valorErradoDeExtra("3 perguntas por R$ 17.", [PERGUNTA])).toContain("R$ 15");
    expect(valorErradoDeExtra("Fica R$ 14 no total.\n\n[[PIX: Pergunta nova x2]]", [PERGUNTA])).toContain("R$ 10");
  });

  it("oferecer 4 perguntas não vira quantidade combinada, e pedir 2 vira", () => {
    const oferta = { direction: "outbound" as const, body: "Uma pergunta é R$ 7.\n2 perguntas por R$ 10.\n4 perguntas por R$ 17." };
    expect(quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", [PERGUNTA], [oferta, { direction: "inbound", body: "quero uma" }])).toBeNull();
    expect(quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", [PERGUNTA], [oferta, { direction: "inbound", body: "quero 2 perguntas" }])).toContain("R$ 10");
  });
});
