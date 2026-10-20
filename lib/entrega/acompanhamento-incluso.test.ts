/**
 * O acompanhamento que vem com o trabalho dura 7 dias; depois, a conversa diária é o Acompanhamento pago.
 * Medido em 20/10/2026: cliente com doze dias de compra e 87 mensagens numa manhã, sem nunca ouvir a oferta.
 */
import { describe, expect, it } from "vitest";

import { DIAS_DO_ACOMPANHAMENTO_INCLUSO, acompanhamentoDosExtras, blocoDoAcompanhamentoIncluso } from "./acompanhamento-incluso";

const PERGUNTA = { name: "Pergunta nova", price_cents: 500, when: "outra pergunta." };
const ACOMPANHAMENTO = { name: "Acompanhamento", price_cents: 6000, when: "quer falar todo dia.", valid_days: 30 };
const EXTRAS = [PERGUNTA, ACOMPANHAMENTO];

describe("acompanhamento incluso", () => {
  it("⭐ o caso medido: comprou há 12 dias, sem Acompanhamento pago — o bloco oferece o pago e proíbe ritual fora do material", () => {
    const bloco = blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: 12, extras: EXTRAS, pagos: [] });
    expect(bloco).toContain("O ACOMPANHAMENTO INCLUSO TERMINOU");
    expect(bloco).toContain("há 12 dias");
    expect(bloco).toContain("*Acompanhamento*, R$ 60");
    expect(bloco).toContain("[[PIX: Acompanhamento]]");
    expect(bloco).toContain("Dúvida sobre as ETAPAS do material dela");
    expect(bloco).toContain("NUNCA conduza ritual");
  });

  it("dentro dos 7 dias, para quem não comprou, ou sem data: nada muda", () => {
    expect(blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: DIAS_DO_ACOMPANHAMENTO_INCLUSO - 1, extras: EXTRAS, pagos: [] })).toBe("");
    expect(blocoDoAcompanhamentoIncluso({ comprou: false, diasDesdeACompra: 30, extras: EXTRAS, pagos: [] })).toBe("");
    expect(blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: null, extras: EXTRAS, pagos: [] })).toBe("");
  });

  it("com o Acompanhamento pago valendo, ela segue atendida todo dia; vencido, o bloco volta", () => {
    const ativo = [{ slug: "acompanhamento", hora: "10:00", dia: "15/10", diasAtras: 5 }];
    const vencido = [{ slug: "acompanhamento", hora: "10:00", dia: "10/09", diasAtras: 40 }];
    expect(blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: 20, extras: EXTRAS, pagos: ativo })).toBe("");
    expect(blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: 50, extras: EXTRAS, pagos: vencido })).toContain("TERMINOU");
  });

  it("sem Acompanhamento cadastrado, o caminho pago é a pergunta nova", () => {
    expect(acompanhamentoDosExtras([PERGUNTA])).toBeNull();
    const bloco = blocoDoAcompanhamentoIncluso({ comprou: true, diasDesdeACompra: 9, extras: [PERGUNTA], pagos: [] });
    expect(bloco).toContain("uma pergunta nova às cartas");
    expect(bloco).not.toContain("[[PIX: Acompanhamento]]");
  });
});
