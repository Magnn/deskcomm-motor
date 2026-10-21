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
});
