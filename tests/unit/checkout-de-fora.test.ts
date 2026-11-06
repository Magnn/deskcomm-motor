/** O checkout de quem paga de fora do Brasil: a marca da área no produto e o e-mail já preenchido na Stripe. */
import { describe, expect, it } from "vitest";

import { comEmailPreenchido, descricaoComMarca } from "@/lib/area-do-cliente/cobranca";

describe("checkout de fora", () => {
  it("⭐ o produto leva a marca da área, sem repetir quando já a traz", () => {
    expect(descricaoComMarca("O Código da Conexão", "Meu Mistério")).toBe("Meu Mistério · O Código da Conexão");
    expect(descricaoComMarca("Meu Mistério — Plano", "meu mistério")).toBe("Meu Mistério — Plano");
    expect(descricaoComMarca("O Código da Conexão", "")).toBe("O Código da Conexão");
  });

  it("⭐ o link da Stripe abre com o e-mail da pessoa; e-mail inválido não entra", () => {
    expect(comEmailPreenchido("https://buy.stripe.com/abc", "ana+1@exemplo.pt")).toBe("https://buy.stripe.com/abc?prefilled_email=ana%2B1%40exemplo.pt");
    expect(comEmailPreenchido("https://buy.stripe.com/abc?x=1", "a@b.pt")).toBe("https://buy.stripe.com/abc?x=1&prefilled_email=a%40b.pt");
    expect(comEmailPreenchido("https://buy.stripe.com/abc", "sem-arroba")).toBe("https://buy.stripe.com/abc");
    expect(comEmailPreenchido("https://buy.stripe.com/abc", undefined)).toBe("https://buy.stripe.com/abc");
  });
});
