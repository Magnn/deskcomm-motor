import { describe, expect, it } from "vitest";

import { linkDoValorPrometido } from "./link-do-valor";
import { pricingSchema } from "./tipos";

const L = (nome: string, id: string) => ({ name: nome, url: `https://pay.exemplo.com.br/${id}` });
const pricing = pricingSchema.parse({
  enabled: true,
  list_price_cents: 6000,
  list_product_links: [L("Coração", "c60"), L("Caminhos", "k60")],
  steps: [{ price_cents: 5000, product_links: [L("Coração", "c50"), L("Caminhos", "k50")] }],
  post_sale: { enabled: true, price_cents: 3500, wait_hours: 0, product_links: [L("Oração", "oracao")] },
});
const ok = (r: ReturnType<typeof linkDoValorPrometido>) => {
  if ("recusa" in r) throw new Error(`recusou: ${r.recusa}`);
  return r;
};

describe("o link cobra o valor que a mensagem diz", () => {
  it("⭐ o caso medido: disse R$ 50 e mandou o link de R$ 60 do mesmo produto — troca pelo de R$ 50", () => {
    const r = ok(linkDoValorPrometido("Fica combinado por esses R$ 50. O link é este: https://pay.exemplo.com.br/k60", pricing));
    expect(r.corpo).toContain("https://pay.exemplo.com.br/k50");
    expect(r.corpo).not.toContain("k60");
    expect(r.trocas).toEqual([{ de: "pay.exemplo.com.br/k60", para: "pay.exemplo.com.br/k50", cents: 5000 }]);
  });

  it("⭐ o caso medido: link do site de pagamento que não está cadastrado (o do preço antigo) é recusado com a lista certa", () => {
    const r = linkDoValorPrometido("Pra você fica *R$ 60*, uma vez só. https://pay.exemplo.com.br/antigo130", pricing);
    expect("recusa" in r && r.recusa).toContain("não é um link de pagamento cadastrado");
    expect("recusa" in r && r.recusa).toContain("https://pay.exemplo.com.br/c60");
  });

  it("valor de referência não é o valor prometido: 'de R$ 130 por R$ 60' com o link de R$ 60 passa", () => {
    const corpo = "O valor de referência é R$ 130, pra você fica R$ 60. https://pay.exemplo.com.br/c60";
    expect(ok(linkDoValorPrometido(corpo, pricing))).toEqual({ corpo, trocas: [] });
  });

  it("defendeu o valor cheio e ofereceu o degrau: vale o último valor dito", () => {
    const r = ok(linkDoValorPrometido("O valor é R$ 60, mas hoje consigo R$ 50 pra você. pay.exemplo.com.br/c60", pricing));
    expect(r.corpo).toContain("pay.exemplo.com.br/c50");
  });

  it("mensagem sem valor: o link cadastrado segue como está", () => {
    const corpo = "Segue o seu link de novo: https://pay.exemplo.com.br/c50";
    expect(ok(linkDoValorPrometido(corpo, pricing))).toEqual({ corpo, trocas: [] });
  });

  it("link de outra oferta da configuração e link de outro site passam sem conferência", () => {
    const corpo = "A Oração é por aqui: https://pay.exemplo.com.br/oracao e o meu perfil é https://instagram.com/cigana";
    expect(ok(linkDoValorPrometido(corpo, pricing))).toEqual({ corpo, trocas: [] });
  });

  it("sem links cadastrados para o produto, nada é conferido", () => {
    const semLinks = pricingSchema.parse({ enabled: true, list_price_cents: 6000 });
    const corpo = "Está por R$ 60: https://pay.exemplo.com.br/qualquer";
    expect(ok(linkDoValorPrometido(corpo, semLinks))).toEqual({ corpo, trocas: [] });
  });
});
