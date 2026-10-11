// tests/unit/quebras-de-verdade.test.ts
import { describe, expect, it } from "vitest";

import { quebrasDeVerdade, splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";

// A notação que o modelo escreve: os dois caracteres `\` e `n`, não a quebra.
const ESCRITA = String.raw`\n`;

describe("quebrasDeVerdade — a quebra de linha que o modelo escreveu por extenso", () => {
  // Formas que chegaram ao aparelho de clientes em produção entre 07 e 11/10/2026.
  it("⭐ a notação vira quebra de verdade", () => {
    expect(quebrasDeVerdade(`Eu entendo. ${ESCRITA}${ESCRITA}E sabe o que eu sinto daqui?`)).toBe(
      "Eu entendo. \n\nE sabe o que eu sinto daqui?",
    );
    expect(quebrasDeVerdade(`${ESCRITA}${ESCRITA}Você não precisa segurar isso sozinha.`)).toBe(
      "\n\nVocê não precisa segurar isso sozinha.",
    );
    expect(quebrasDeVerdade(`Primeira linha${ESCRITA}Segunda linha`)).toBe("Primeira linha\nSegunda linha");
  });

  it("a variante com retorno de carro também", () => {
    const comRetorno = String.raw`\r\n`;
    expect(quebrasDeVerdade(`um${comRetorno}${comRetorno}Dois`)).toBe("um\n\nDois");
  });

  it("duas ou mais viram quebra mesmo coladas em minúscula", () => {
    expect(quebrasDeVerdade(`fim.${ESCRITA}${ESCRITA}mas tem mais`)).toBe("fim.\n\nmas tem mais");
  });

  it("uma sozinha colada em minúscula é texto de quem fala de arquivo", () => {
    const caminho = String.raw`a pasta é C:\novo\nomes`;
    expect(quebrasDeVerdade(caminho)).toBe(caminho);
  });

  it("texto sem a notação não muda", () => {
    const texto = "Olá!\n\nTudo bem?";
    expect(quebrasDeVerdade(texto)).toBe(texto);
  });

  it("⭐ depois de consertada, a resposta divide em parágrafo e não no meio da frase", () => {
    const corpo = quebrasDeVerdade(
      `Eu sei, meu bem. Dói ver quem a gente ama dividido assim. ${ESCRITA}${ESCRITA}Mas presta atenção numa coisa: sentir isso não te faz fraca.`,
    );
    expect(splitIntoBubbles(corpo, 70)).toEqual([
      "Eu sei, meu bem. Dói ver quem a gente ama dividido assim.",
      "Mas presta atenção numa coisa: sentir isso não te faz fraca.",
    ]);
  });
});
