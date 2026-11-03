import { describe, expect, it } from "vitest";

import { podeTerChavePix, trocarChavesErradas } from "./chave-certa-no-envio";

const principal = { key: "+5569993677810", holder: "Matheus Lobato Bocalon", city: "Porto Velho", primary: true } as never;

describe("a chave certa em todo envio (03/11/2026: a chave antiga ainda saía)", () => {
  it("o CNPJ antigo sozinho no balão (o jeito de mandar para copiar) vira a chave de celular", () => {
    expect(trocarChavesErradas("62.917.956/0001-00", principal)).toEqual({ body: "69993677810", trocadas: ["62.917.956/0001-00"] });
    expect(trocarChavesErradas("62917956000100", principal).body).toBe("69993677810");
  });

  it("chave errada numa frase que fala de Pix também é trocada", () => {
    const r = trocarChavesErradas("A chave Pix é o CNPJ 62.917.956/0001-00, em nome da Arcanum.", principal);
    expect(r.body).toBe("A chave Pix é o CNPJ 69993677810, em nome da Arcanum.");
    expect(trocarChavesErradas("Faz o pix pra financeiro@antigo.com.br", principal).body).toBe("Faz o pix pra 69993677810");
    expect(trocarChavesErradas("Pix: (69) 98111-2233", principal).body).toBe("Pix: 69993677810");
  });

  it("a chave certa, com ou sem +55, passa intacta", () => {
    for (const ok of ["69993677810", "+55 69 99367-7810", "Pix: (69) 99367-7810", "+5569993677810"]) {
      expect(trocarChavesErradas(ok, principal).trocadas, ok).toEqual([]);
    }
  });

  it("não mexe no código copia e cola, em link, nem em número fora de assunto de Pix", () => {
    const codigo = "00020126580014BR.GOV.BCB.PIX0136+556998111223352040000530398654046.005802BR5925X6009Y62070503***6304ABCD";
    expect(trocarChavesErradas(codigo, principal).trocadas).toEqual([]);
    expect(trocarChavesErradas("Paga no cartão: https://buy.stripe.com/x?tel=69981112233 chave", principal).trocadas).toEqual([]);
    expect(trocarChavesErradas("Meu WhatsApp pessoal é (69) 98111-2233, me chama lá.", principal).trocadas).toEqual([]);
    expect(trocarChavesErradas("Combinado para 03/11/2026, R$ 130.", principal).trocadas).toEqual([]);
  });

  it("filtro barato: só lê a chave da empresa quando o texto pode ter uma", () => {
    expect(podeTerChavePix("Oi, tudo bem?")).toBe(false);
    expect(podeTerChavePix("62.917.956/0001-00")).toBe(true);
    expect(podeTerChavePix("https://buy.stripe.com/abc")).toBe(false);
  });
});
