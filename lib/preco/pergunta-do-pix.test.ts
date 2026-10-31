import { describe, expect, it } from "vitest";

import { blocoDePreco } from "./bloco-do-prompt";
import { jaPerguntouDoPix, repetePerguntaDoPix } from "./pergunta-do-pix";

const agente = (body: string) => ({ direction: "outbound", body });
const pessoa = (body: string) => ({ direction: "inbound", body });
const PERGUNTA = "É R$ 60, uma vez só. Quer que eu te mande o Pix agora?";

describe("a pergunta do Pix sai uma vez", () => {
  it("⭐ o caso de 31/10: pediu o trabalho, ouviu o valor, e a pergunta não se repete", () => {
    const conversa = [pessoa("Algum trabalho"), agente(PERGUNTA), pessoa("Vai fazer com que ele voltar")];
    expect(jaPerguntouDoPix(conversa)).toBe(true);
    expect(repetePerguntaDoPix(PERGUNTA, conversa)).toBe(true);
    expect(repetePerguntaDoPix("Prefere que eu te mande o Pix?", conversa)).toBe(true);
  });

  it("a primeira pergunta passa, e a cobrança nunca é barrada", () => {
    expect(repetePerguntaDoPix(PERGUNTA, [pessoa("oi")])).toBe(false);
    expect(repetePerguntaDoPix("Copia o código: 000201abc", [agente(PERGUNTA)])).toBe(false);
  });

  it("valor novo é oferta nova: o lembrete de valor menor passa", () => {
    expect(repetePerguntaDoPix("Consegui deixar por R$ 50. Quer que eu mande o Pix agora?", [agente(PERGUNTA)])).toBe(false);
  });

  it("depois de uma cobrança enviada, a contagem recomeça", () => {
    const conversa = [agente(PERGUNTA), agente("000201abc")];
    expect(jaPerguntouDoPix(conversa)).toBe(false);
    expect(repetePerguntaDoPix(PERGUNTA, conversa)).toBe(false);
  });

  it("o bloco de preço só traz a linha quando já perguntou", () => {
    const c = { enabled: true, list_price_cents: 13000, steps: [] } as never;
    expect(blocoDePreco(c, { reclamacoes: 0, jaPerguntouDoPix: true })).toContain("PIX JÁ OFERECIDO");
    expect(blocoDePreco(c, { reclamacoes: 0 })).not.toContain("PIX JÁ OFERECIDO");
  });
});
