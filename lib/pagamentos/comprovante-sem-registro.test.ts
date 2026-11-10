import { describe, expect, it } from "vitest";

import { comprovanteSemRegistro, confirmaPagamentoSemRegistro } from "./comprovante-pix";

const m = (direction: "inbound" | "outbound", hora: string, body: string, type?: string) => ({
  direction,
  body,
  sent_at: `2026-11-09T${hora}:00-03:00`,
  ...(type ? { type } : {}),
});

// Caso de 09/11/2026: entrada de R$ 50 pela chave, comprovante às 15:48 não confirmado, "deu certo?" às 17:22.
const CONVERSA = [
  m("outbound", "15:46", "Fechado: você entra com R$ 50 agora e o restante de R$ 80 a gente acerta depois. Pra pagar no Pix (*R$ 50 (Entrada)*): 1. Toque e segure na chave."),
  m("outbound", "15:46", "69993677810"),
  m("inbound", "15:48", "[imagem]", "image"),
  m("inbound", "15:48", "Sim"),
  m("outbound", "15:49", "Recebi o seu comprovante. Deixa eu conferir aqui."),
  m("inbound", "17:22", "Deu certo, começa hoje os procedimentos?"),
];

describe("comprovante de rodada anterior sem pagamento registrado — 09/11/2026", () => {
  it("⭐ sem pagamento registrado depois da cobrança, o comprovante antigo segura o 'caiu'", () => {
    expect(comprovanteSemRegistro(CONVERSA, null)).toBe(true);
    expect(confirmaPagamentoSemRegistro("Que bênção! O seu comprovante caiu certinho.", comprovanteSemRegistro(CONVERSA, null))).not.toBeNull();
    expect(confirmaPagamentoSemRegistro("Seu pagamento está confirmado, meu bem.", true)).not.toBeNull();
  });

  it("⭐ nas rodadas seguintes, conversa comum com 'certinho' ou 'entrou' segue (10/11/2026: a conversa ficou muda)", () => {
    expect(confirmaPagamentoSemRegistro("Agora entendi certinho. O seu nome entrou no meu altar hoje.", true)).toBeNull();
    expect(confirmaPagamentoSemRegistro("Tudo certo pra você fazer a Noite 1 hoje?", true)).toBeNull();
    expect(confirmaPagamentoSemRegistro("O pagamento ainda não caiu, o comprovante está com a equipe.", true)).toBeNull();
  });

  it("pagamento registrado depois da cobrança libera", () => {
    expect(comprovanteSemRegistro(CONVERSA, new Date("2026-11-09T15:50:00-03:00"))).toBe(false);
  });

  it("pagamento de antes da cobrança não paga a cobrança nova", () => {
    expect(comprovanteSemRegistro(CONVERSA, new Date("2026-11-09T11:00:00-03:00"))).toBe(true);
  });

  it("sem cobrança, ou sem imagem depois dela, não há o que travar", () => {
    expect(comprovanteSemRegistro(CONVERSA.slice(2), null)).toBe(false);
    expect(comprovanteSemRegistro([CONVERSA[0]!, m("inbound", "15:50", "vou fazer mais tarde")], null)).toBe(false);
  });
});
