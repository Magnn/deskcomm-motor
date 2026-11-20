import { describe, expect, it } from "vitest";
import { linkDeCobrancaCopiado } from "./link-de-cobranca-copiado";

const config = {
  pricing: { list_product_links: [{ name: "Abertura do Coração", url: "https://pay.cakto.com.br/6pabzsk_1132655" }] },
  catalog: { produtos: [{ nome: "Lua Nova", link: "https://buy.stripe.com/9B6fZjgjMfJu3Xk7EF3411A" }] },
};

describe("link de cartão copiado do histórico (Fran, 20/11/2026)", () => {
  it("o link de R$ 7 reenviado como se fosse de R$ 81 é recusado", () => {
    const corpo = "No cartão, o valor das três é R$ 81, pelo link que já te mandei: https://buy.stripe.com/bJedRb6Jc40M8dA3op3432R";
    expect(linkDeCobrancaCopiado(corpo, config)).toContain("cobrança anterior");
  });
  it("sem protocolo e com pontuação no fim também", () => {
    expect(linkDeCobrancaCopiado("é este: buy.stripe.com/bJedRb6Jc40M8dA3op3432R.", config)).not.toBeNull();
  });
  it("link cadastrado no catálogo passa", () => {
    expect(linkDeCobrancaCopiado("A Lua Nova é por aqui: https://buy.stripe.com/9B6fZjgjMfJu3Xk7EF3411A", config)).toBeNull();
  });
  it("marca de cobrança e link oficial do trabalho passam (o sistema é quem gera o cartão)", () => {
    expect(linkDeCobrancaCopiado("[[PIX: Pergunta da Terceira Pessoa x3]]", config)).toBeNull();
    expect(linkDeCobrancaCopiado("https://pay.cakto.com.br/6pabzsk_1132655", config)).toBeNull();
  });
});
