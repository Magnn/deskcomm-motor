/**
 * Quem promete reenviar o pagamento, reenvia — o texto real de 20/10/2026 e os que não podem ser barrados.
 */
import { describe, expect, it } from "vitest";

import { promessaDeReenvioSemCobranca } from "./promessa-de-reenvio";

describe("promessa de reenviar o pagamento", () => {
  it("⭐ o texto real (prometeu e não mandou) é recusado, com o caminho no motivo", () => {
    const real = "Vou te mandar de novo agora, Claudia. Copia esse código inteiro, do começo ao fim, e cola na opção *Pix Copia e Cola* do seu banco.";
    const motivo = promessaDeReenvioSemCobranca(real);
    expect(motivo).toContain("[[PIX:");
    expect(motivo).toContain("Pix Copia e Cola");
  });

  it("outras formas da mesma promessa também", () => {
    for (const t of [
      "Te reenvio o código do Pix já já.",
      "Já te mando o link novamente, meu bem.",
      "Vou te passar o pix outra vez, tá?",
    ]) {
      expect(promessaDeReenvioSemCobranca(t), t).not.toBeNull();
    }
  });

  it("⭐ a promessa COM a cobrança junto passa", () => {
    expect(promessaDeReenvioSemCobranca("Vou te mandar de novo, cola na opção Pix Copia e Cola:\n[[PIX: Pergunta nova]]")).toBeNull();
    expect(promessaDeReenvioSemCobranca("Te mando o link de novo: https://buy.stripe.com/abc")).toBeNull();
    expect(promessaDeReenvioSemCobranca("Reenvio aqui:\n[[COBRAR: 60 | Trabalho Espiritual]]")).toBeNull();
  });

  it("o que não é promessa de reenviar o pagamento não é barrado", () => {
    expect(promessaDeReenvioSemCobranca("O valor é R$ 5. Quando o pagamento cair eu vejo aqui.")).toBeNull();
    expect(promessaDeReenvioSemCobranca("Te mando de novo a oração amanhã cedo, meu bem.")).toBeNull();
    expect(promessaDeReenvioSemCobranca("Conseguiu copiar o código?")).toBeNull();
  });
});
