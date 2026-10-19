/**
 * O valor dito de uma cobrança avulsa é o cadastrado — os textos reais de 19/10/2026 em que a agente cobrou
 * R$ 130 por uma pergunta de R$ 5.
 */
import { describe, expect, it } from "vitest";

import type { Extra } from "./tipos";
import { palavrasDoExtra, valorErradoDeExtra, valoresDitos } from "./valor-do-extra";

const EXTRAS = [
  { name: "Pergunta nova", when: "x", price_cents: 500 },
  { name: "Acompanhamento do mês", when: "x", price_cents: 6000, valid_days: 30 },
  { name: "Sinastria Amorosa", when: "x", price_cents: 3700 },
] as unknown as Extra[];

describe("valor dito de cobrança avulsa", () => {
  it("⭐ os textos reais que cobraram R$ 130 por pergunta são recusados", () => {
    for (const texto of [
      "Pra abrir a mesa de novo pra essas perguntas novas, é R$ 130 por pergunta, que é pra firmar a vela no altar.",
      "Calma, meu bem. Cada pergunta nova custa R$ 130, porque é uma mesa aberta e uma vela firmada no altar pra cada uma.",
      "E antes de você decidir, quero corrigir uma coisa que saiu errada aqui: o valor de uma pergunta nova é R$ 130, não os R$ 5 que eu te passei.",
    ]) {
      const motivo = valorErradoDeExtra(texto, EXTRAS);
      expect(motivo, texto).toContain("R$ 5");
      expect(motivo).toContain("R$ 130");
    }
  });

  it("o valor certo, e múltiplos pequenos dele, passam", () => {
    expect(valorErradoDeExtra("Pra abrir a mesa de novo pra essa pergunta é R$ 5 por pergunta.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("As três perguntas saem por R$ 15.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("A Sinastria Amorosa é R$ 37.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("O acompanhamento do mês sai por 60 reais.", EXTRAS)).toBeNull();
  });

  it("frase que compara com o trabalho principal não é cobrança da avulsa", () => {
    expect(valorErradoDeExtra("O trabalho completo é R$ 130, e uma pergunta nova é R$ 5.", EXTRAS)).toBeNull();
  });

  it("frase sem valor, ou valor sem a palavra da cobrança, passa", () => {
    expect(valorErradoDeExtra("Me diz qual das três perguntas você quer ver primeiro?", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("Aqui o seu fica em R$ 130, uma vez só.", EXTRAS)).toBeNull();
  });

  it("outros valores errados também são pegos: sinastria e acompanhamento", () => {
    expect(valorErradoDeExtra("A sinastria fica R$ 130 pra você.", EXTRAS)).toContain("R$ 37");
    expect(valorErradoDeExtra("O acompanhamento é R$ 99 por mês.", EXTRAS)).toContain("R$ 60");
  });

  it("instrumentos: palavras do nome e valores ditos", () => {
    expect(palavrasDoExtra("Pergunta nova")).toEqual(["pergunta"]);
    expect(palavrasDoExtra("Acompanhamento do mês")).toEqual(["acompanhamento"]);
    expect(valoresDitos("R$ 130, R$5,50, R$ 1.300 e 15 reais")).toEqual([13000, 550, 130000, 1500]);
  });
});
