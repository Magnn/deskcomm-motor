import { describe, expect, it } from "vitest";

import { blocoDoPixQueNaoColou, relatouProblemaNoPix } from "./pix-que-nao-colou";

const AGORA = new Date("2026-10-21T15:00:00Z");
const PIX = "00020101021226740014br.gov.bcb.pix2552pix.ebanx.com/qr/v2/715ACF";
const conversa = (fala: string, pixHa = 30) => [
  { direction: "outbound", body: PIX, sent_at: new Date(AGORA.getTime() - pixHa * 60_000).toISOString() },
  { direction: "inbound", body: fala, sent_at: new Date(AGORA.getTime() - 60_000).toISOString() },
];

describe("Pix que não colou", () => {
  it("reconhece as falas reais de 21/10", () => {
    for (const f of ["Está dando inválido o codigo", "Não está dando certo nao", "Faz ele da pra colar poos assim nao cola", "Nao mandou o Pix ainda pra mim"]) {
      expect(relatouProblemaNoPix(f)).toBe(true);
    }
    for (const f of ["Hoje não posso", "Ok", "Só tem dinheiro dia 10", "Eu não tenho como pagar não o seu trabalho não"]) {
      expect(relatouProblemaNoPix(f)).toBe(false);
    }
  });

  it("o bloco entra com Pix recente e a queixa; fica fora sem Pix ou com Pix de mais de 24 h", () => {
    expect(blocoDoPixQueNaoColou(conversa("Está dando inválido o codigo"), AGORA)).toMatch(/código NOVO/);
    expect(blocoDoPixQueNaoColou(conversa("Ok"), AGORA)).toBe("");
    expect(blocoDoPixQueNaoColou(conversa("não cola", 25 * 60), AGORA)).toBe("");
    expect(blocoDoPixQueNaoColou([{ direction: "inbound", body: "não cola" }], AGORA)).toBe("");
  });
});
