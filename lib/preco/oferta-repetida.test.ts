import { describe, expect, it } from "vitest";

import { ofertaRepetidaSeguida } from "./oferta-repetida";

const cig = (body: string) => ({ direction: "outbound", body });
const ela = (body: string) => ({ direction: "inbound", body });
const OFERTA = "São 30 dias, R$ 75, uma vez só. Faz sentido pra você agora?";

describe("a oferta duas vezes seguidas (Fran, 20/11/2026)", () => {
  it("o mesmo valor logo depois de uma resposta sem aceite é recusado", () => {
    const h = [ela("O divórcio"), cig(OFERTA), ela("Se até terça nada significativo acontecer vou propor.")];
    expect(ofertaRepetidaSeguida("O acompanhamento é pra isso. São R$ 75, uma vez só. Quer que eu mande a chave?", h)).toContain("R$ 75");
  });

  it("recusa explícita também barra, mesmo com palavra de abertura", () => {
    const h = [cig(OFERTA), ela("não quero agora, depois eu vejo")];
    expect(ofertaRepetidaSeguida("Fica R$ 75.", h)).not.toBeNull();
  });

  it("se ela deu abertura, o valor pode voltar", () => {
    for (const fala of ["quero sim", "como pago?", "manda a chave", "quanto fica mesmo?"]) {
      expect(ofertaRepetidaSeguida("Fechado: R$ 75. Segue o Pix.", [cig(OFERTA), ela(fala)])).toBeNull();
    }
  });

  it("valor novo, resposta sem valor ou oferta mais antiga não são repetição", () => {
    const h = [cig(OFERTA), ela("tá caro")];
    expect(ofertaRepetidaSeguida("Tem a semana, R$ 27.", h)).toBeNull();
    expect(ofertaRepetidaSeguida("Entendo, meu bem.", h)).toBeNull();
    const antiga = [cig(OFERTA), ela("vou pensar"), cig("Tudo bem."), ela("e a terça?")];
    expect(ofertaRepetidaSeguida("São R$ 75.", antiga)).toBeNull();
  });

  it("R$ 75,00 e R$ 75 são o mesmo valor", () => {
    expect(ofertaRepetidaSeguida("R$ 75,00 só.", [cig("R$ 75"), ela("hmm")])).not.toBeNull();
  });
});
