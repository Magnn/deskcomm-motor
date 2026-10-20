/**
 * Resposta em áudio é resposta. Medido em 20/10/2026: uma lead respondeu quatro vezes por áudio a uma pergunta do
 * fluxo de entrada, o fluxo achou o texto vazio e a estacionou ("o prazo venceu e a saída «Sem resposta» não está
 * ligada a nada").
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { textoDaRespostaDoLead } from "./resposta-do-lead";

describe("textoDaRespostaDoLead", () => {
  it("texto vale como sempre", () => {
    expect(textoDaRespostaDoLead({ body: "  Joana, 24/06/1972 ", type: "text" })).toBe("Joana, 24/06/1972");
  });

  it("⭐ o caso medido: áudio sem texto é resposta — a transcrição quando já existe, senão o marcador", () => {
    expect(textoDaRespostaDoLead({ body: null, media_derived_text: "Meu nome é Joana Ferreira", type: "audio" })).toBe("Meu nome é Joana Ferreira");
    expect(textoDaRespostaDoLead({ body: "", media_derived_text: null, type: "audio" })).toBe("[áudio]");
    expect(textoDaRespostaDoLead({ body: null, type: "image" })).toBe("[imagem]");
  });

  it("o aviso de mídia não lida não vira o conteúdo dela; sem mídia e sem texto, não há resposta", () => {
    expect(
      textoDaRespostaDoLead({ body: null, media_derived_text: "[o cliente enviou uma mídia que não consegui interpretar]", type: "audio" }),
    ).toBe("[áudio]");
    expect(textoDaRespostaDoLead({ body: null, type: "text" })).toBeNull();
    expect(textoDaRespostaDoLead(null)).toBeNull();
  });

  it("as três leituras da resposta do fluxo passam pela regra (motor, ponte do turno e entrada)", () => {
    for (const arq of ["lib/followup/engine.ts", "lib/followup/turn-bridge.ts", "lib/followup/aplicar-inbound.ts"]) {
      const fonte = readFileSync(arq, "utf8");
      expect(fonte, arq).toContain("textoDaRespostaDoLead(");
      expect(fonte, arq).toContain("media_derived_text");
    }
  });
});
