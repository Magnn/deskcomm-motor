import { describe, expect, it } from "vitest";

import { falaEmTerceiraPessoa } from "./fala-em-terceira-pessoa";

describe("a agente narrando a pessoa em terceira pessoa (19–20/11/2026)", () => {
  it("as três frases medidas são recusadas", () => {
    for (const f of [
      "Ele perguntou o valor, então vem na primeira frase, Angelo: um trabalho individual como esse costuma sair entre R$ 380 e R$ 600.",
      "Ele perguntou o valor, Paulinho. Vou te dizer com clareza.",
      "Ela perguntou o que pode ser feito, Larissa. Então eu te digo o que o trabalho faz por vocês.",
      "Entendi. Ela quer saber quanto fica, Maria.",
    ]) expect(falaEmTerceiraPessoa(f)).not.toBeNull();
  });
  it("falar do ex, do marido ou de terceiros passa", () => {
    for (const f of [
      'Ele disse "eu vou", Fabiana. E falou isso olhando em você.',
      "Ele perguntou o que falaram dele pra você, Fabiana. Isso é homem querendo saber o que você pensa dele.",
      "Ele disse que vem na hora do almoço pra conversar com você, Fabiana.",
      "São R$ 130, uma vez só. Quer que eu te mande a chave?",
      "A noite é sua e não precisa de roteiro.",
    ]) expect(falaEmTerceiraPessoa(f)).toBeNull();
  });
});
