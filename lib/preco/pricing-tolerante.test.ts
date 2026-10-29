/**
 * Um extra inválido não desliga o preço inteiro. Medido em 29/10/2026: o extra "Sentimento da Fotografia" foi
 * gravado com `when` de 661 caracteres (limite 400) e, por três dias, a agente ficou sem Pix, escada e entrada.
 */
import { describe, expect, it, vi } from "vitest";

import { lerPricing, pricingTolerante } from "./tipos";

const base = {
  enabled: true,
  list_price_cents: 13000,
  list_product_links: [{ name: "Abertura do Coração", url: "https://pay.exemplo.com/coracao" }],
  steps: [{ price_cents: 10000, product_links: [{ name: "Abertura do Coração", url: "https://pay.exemplo.com/coracao-100" }] }],
  provider_only_checkout: true,
};
const extraBom = { name: "Pergunta nova", when: "a pessoa pede outra pergunta depois da leitura", price_cents: 500 };
const extraLongo = { name: "Sentimento da Fotografia", when: "x".repeat(661), delivery: "y".repeat(629), price_cents: 1500 };

describe("pricingTolerante", () => {
  it("⭐ descarta só o extra inválido e mantém o preço, a escada e os outros extras", () => {
    const r = pricingTolerante({ ...base, extras: [extraBom, extraLongo] });
    expect(r?.extrasDescartados).toEqual(["Sentimento da Fotografia"]);
    expect(r?.pricing.list_price_cents).toBe(13000);
    expect(r?.pricing.steps).toHaveLength(1);
    expect(r?.pricing.provider_only_checkout).toBe(true);
    expect(r?.pricing.extras?.map((e) => e.name)).toEqual(["Pergunta nova"]);
  });

  it("configuração válida passa inteira, sem descarte", () => {
    expect(pricingTolerante({ ...base, extras: [extraBom] })?.extrasDescartados).toEqual([]);
  });

  it("campo inválido fora dos extras continua reprovando tudo", () => {
    expect(pricingTolerante({ ...base, list_price_cents: -1, extras: [extraLongo] })).toBeNull();
    expect(pricingTolerante({ ...base, list_price_cents: -1 })).toBeNull();
  });
});

describe("lerPricing", () => {
  it("avisa quem chama sobre o extra descartado", () => {
    const aviso = vi.fn();
    expect(lerPricing({ pricing: { ...base, extras: [extraLongo] } }, aviso)?.enabled).toBe(true);
    expect(aviso).toHaveBeenCalledWith(["Sentimento da Fotografia"]);
  });

  it("desligado segue sendo null", () => {
    expect(lerPricing({ pricing: { ...base, enabled: false, extras: [extraLongo] } })).toBeNull();
  });
});
