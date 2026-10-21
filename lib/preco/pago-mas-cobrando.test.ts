import { describe, expect, it } from "vitest";

import { falaComoSeNaoTivessePago, recusaDeQuemJaPagou } from "./pago-mas-cobrando";

const PENDENTE = { extra: { name: "Pergunta nova" }, minutos: 0 };

describe("pagou, mas a agente continua cobrando", () => {
  it.each([
    "Valmir, o Pix já está aí em cima, meu bem. É só tocar e segurar no código que eu mandei, escolher *Copiar*",
    "Bill, recebi aqui o que você mandou. Ainda não apareceu a confirmação do pagamento do lado de cá.",
    "Deixa eu conferir aqui pra você, tá bom?",
    "Angela, o código não é chave, por isso não acha. Tem que colar na opção Pix Copia e Cola.",
    "Entendi, Raquel. Abre este link de pagamento e paga por lá.",
    "Recebi aqui o comprovante, meu bem.",
  ])("recusa: %j", (t) => {
    expect(falaComoSeNaoTivessePago(t)).toBe(true);
    expect(recusaDeQuemJaPagou(t, PENDENTE)).toMatch(/JÁ CAIU/);
  });

  it.each([
    "Claudia, o seu Pix dos R$ 5 caiu aqui. Já está confirmado 🕯️ Vou abrir a mesa agora pra sua pergunta.",
    "Escolhe 3 números diferentes, de 1 a 22, que eu abro as cartas pra ela.",
    "Parte 5: as três chaves da conexão — o que falar, quando falar e o que evitar.",
  ])("deixa sair: %j", (t) => {
    expect(recusaDeQuemJaPagou(t, PENDENTE)).toBeNull();
  });

  it("sem pagamento pendente, não trava nada", () => {
    expect(recusaDeQuemJaPagou("É só copiar o código do Pix", null)).toBeNull();
  });

  it.each([
    "Ainda não, Maria Aparecida. Primeiro eu preciso ver o pagamento cair aqui.",
    "A confirmação do Pix chega sozinha aqui. E o que falta é só a mesa abrir pra sua pergunta.",
    "Assim que a confirmação do seu Pix aparecer aqui, eu abro a mesa na hora pra essa pergunta.",
    "O que aconteceu é que a confirmação ainda não apareceu aqui do meu lado.",
  ])("depois da 1ª mensagem, ainda recusa dizer que não caiu: %j", (t) => {
    expect(recusaDeQuemJaPagou(t, null, { extra: { name: "Pergunta nova" }, minutos: 12 })).toMatch(/JÁ CAIU/);
  });

  it("uma cobrança nova (outra pergunta) depois da entrega continua permitida", () => {
    const t = "Se quiser fazer outra pergunta, é R$ 5. [[PIX: Pergunta nova]]";
    expect(recusaDeQuemJaPagou(t, null, { extra: { name: "Pergunta nova" }, minutos: 12 })).toBeNull();
  });

  it("pagamento de mais de 2 h já não trava", () => {
    expect(recusaDeQuemJaPagou("Ainda não apareceu o pagamento", null, { extra: { name: "Pergunta nova" }, minutos: 200 })).toBeNull();
  });
});
