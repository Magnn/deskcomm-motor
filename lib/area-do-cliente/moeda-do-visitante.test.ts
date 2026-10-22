import { describe, expect, it } from "vitest";

import { configDaAreaSchema } from "./config";
import { moedaDaOferta, moedaPeloFuso, precoDaOferta, valorNaMoedaDaPagina } from "./moeda-do-visitante";

const oferta = {
  preco_cents: 3700,
  precos_internacionais: [
    { currency: "EUR" as const, price_cents: 1200 },
    { currency: "USD" as const, price_cents: 1400 },
  ],
};

describe("moeda de quem abre o quiz", () => {
  it("o fuso diz a moeda: Brasil em reais, zona do euro em euro, o resto em dólar", () => {
    expect(moedaPeloFuso("America/Sao_Paulo")).toBe("BRL");
    expect(moedaPeloFuso("America/Porto_Velho")).toBe("BRL");
    expect(moedaPeloFuso("Europe/Lisbon")).toBe("EUR");
    expect(moedaPeloFuso("Atlantic/Madeira")).toBe("EUR");
    expect(moedaPeloFuso("Europe/Dublin")).toBe("EUR");
    expect(moedaPeloFuso("America/New_York")).toBe("USD");
    expect(moedaPeloFuso("Europe/London")).toBe("USD");
    expect(moedaPeloFuso("Asia/Tokyo")).toBe("USD");
  });

  it("fuso vazio ou que não dá para ler fica em reais — o que a página fazia antes", () => {
    expect(moedaPeloFuso("")).toBe("BRL");
    expect(moedaPeloFuso(null)).toBe("BRL");
    expect(moedaPeloFuso("UTC")).toBe("BRL");
  });

  it("o valor sai da oferta; moeda sem preço configurado não é vendida", () => {
    expect(precoDaOferta(oferta, "BRL")).toBe(3700);
    expect(precoDaOferta(oferta, "EUR")).toBe(1200);
    expect(precoDaOferta({ preco_cents: 3700 }, "USD")).toBeNull();
  });

  it("sem preço na moeda do fuso, a página cai para reais", () => {
    expect(moedaDaOferta(oferta, "Europe/Lisbon")).toBe("EUR");
    expect(moedaDaOferta({ preco_cents: 3700, precos_internacionais: [{ currency: "USD", price_cents: 1400 }] }, "Europe/Lisbon")).toBe("BRL");
    expect(moedaDaOferta({ preco_cents: 3700 }, "America/New_York")).toBe("BRL");
  });

  it("escreve o valor como a página sempre mostrou o real", () => {
    expect(valorNaMoedaDaPagina(3700, "BRL")).toBe("R$ 37,00");
    expect(valorNaMoedaDaPagina(990, "EUR")).toBe("€ 9,90");
    expect(valorNaMoedaDaPagina(1200, "USD")).toBe("US$ 12,00");
  });

  it("a configuração da área aceita o preço internacional dos quizzes e recusa moeda repetida a mais", () => {
    const ok = configDaAreaSchema.safeParse({ ativo: true, quiz_caminhos: { ativo: true, preco_cents: 1900, precos_internacionais: oferta.precos_internacionais } });
    expect(ok.success).toBe(true);
    const demais = configDaAreaSchema.safeParse({
      ativo: true,
      sinastria_quiz: { ativo: true, precos_internacionais: [...oferta.precos_internacionais, { currency: "EUR", price_cents: 900 }] },
    });
    expect(demais.success).toBe(false);
  });
});
