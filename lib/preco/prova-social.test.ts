import { describe, expect, it } from "vitest";

import { MARCA_DA_PROVA, corpoDizOPreco, destinoDaProva, legendaDaProva, provasParaEnviar } from "./prova-social";
import { pricingSchema } from "./tipos";

const audio = (n: number) => ({ storage_path: `org/provas/depoimento-0${n}.ogg`, mime: "audio/ogg", descricao: `cliente ${n}` });
const pricing = pricingSchema.parse({
  enabled: true,
  list_price_cents: 6000,
  steps: [{ price_cents: 5000, coupon_code: "CINQUENTA" }],
  social_proof: { audios: [audio(1), audio(2), audio(3)] },
});
const m = (direction: string, body: string) => ({ direction, body });

describe("depoimento depois do preço", () => {
  it("⭐ a mensagem que diz o preço leva os depoimentos, no máximo dois", () => {
    const provas = provasParaEnviar(pricing, "Hoje ele está por *R$ 60*, uma vez só.", [m("inbound", "quanto é?")]);
    expect(provas.map((p) => p.descricao)).toEqual(["cliente 1", "cliente 2"]);
  });

  it("⭐ só uma vez por conversa", () => {
    const historico = [m("outbound", "Hoje está por R$ 60."), m("outbound", `${MARCA_DA_PROVA} cliente 1`)];
    expect(provasParaEnviar(pricing, "Consigo fazer por R$ 50.", historico)).toEqual([]);
  });

  it("mensagem sem o preço não leva depoimento", () => {
    expect(provasParaEnviar(pricing, "Me conta o que está acontecendo.", [])).toEqual([]);
    // Valor de outra coisa (R$ 600 de referência, R$ 5 da pergunta) não é o preço do produto.
    expect(corpoDizOPreco("Costuma sair por R$ 600 por aí.", pricing)).toBe(false);
    expect(corpoDizOPreco("A pergunta nova é R$ 5.", pricing)).toBe(false);
    expect(corpoDizOPreco("Fica R$ 60,00 no Pix.", pricing)).toBe(true);
    expect(corpoDizOPreco("Consigo por R$50.", pricing)).toBe(true);
  });

  it("sem depoimento cadastrado, nada muda", () => {
    const semProva = pricingSchema.parse({ enabled: true, list_price_cents: 6000 });
    expect(provasParaEnviar(semProva, "Está por R$ 60.", [])).toEqual([]);
    expect(provasParaEnviar(null, "Está por R$ 60.", [])).toEqual([]);
  });

  it("o destino fica na pasta da conversa e a legenda carrega a marca", () => {
    expect(destinoDaProva("org", "conv", "org/provas/depoimento-01.ogg")).toBe("org/conv/prova-depoimento-01.ogg");
    expect(legendaDaProva(audio(1))).toBe(`${MARCA_DA_PROVA} cliente 1`);
  });
});
