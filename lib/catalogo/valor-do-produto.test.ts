import { describe, expect, it } from "vitest";

import { catalogoSchema } from "./tipos";
import { valorErradoDeProduto } from "./valor-do-produto";

const CATALOGO = catalogoSchema.parse({
  enabled: true,
  produtos: [
    { nome: "Oração dos Sonhos", link: "https://x/oracao", preco_cents: 3500, entrega: "material", espera_horas: 0, ativo: true, pede: [] },
    { nome: "Sons Vocálicos", link: "https://x/sons", preco_cents: 4500, entrega: "material", espera_horas: 0, depois_de: "Oração dos Sonhos", ativo: true, pede: [] },
  ],
});

describe("valor do produto do catálogo", () => {
  it("recusa a Oração dos Sonhos por R$ 130 (o caso real), mesmo com o valor noutro balão", () => {
    const corpo = "A Oração dos Sonhos combina com este momento: é uma oração tradicional.\n\nFica R$ 130, pagamento único. Quer que eu te mande?";
    expect(valorErradoDeProduto(corpo, CATALOGO)).toMatch(/R\$ 35/);
  });

  it("deixa passar o valor certo, mensagem sem valor, dois produtos e comparação com o trabalho", () => {
    expect(valorErradoDeProduto("A Oração dos Sonhos fica R$ 35, pagamento único.", CATALOGO)).toBeNull();
    expect(valorErradoDeProduto("Quer que eu te mande a Oração dos Sonhos?", CATALOGO)).toBeNull();
    expect(valorErradoDeProduto("Oração dos Sonhos R$ 35 e Sons Vocálicos R$ 45", CATALOGO)).toBeNull();
    expect(valorErradoDeProduto("O trabalho é R$ 130 e a Oração dos Sonhos é outra coisa", CATALOGO)).toBeNull();
    expect(valorErradoDeProduto("Fica R$ 130", null)).toBeNull();
  });
});
