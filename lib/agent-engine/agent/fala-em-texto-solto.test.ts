import { describe, expect, it } from "vitest";

import { falaEmTextoSolto } from "./fala-em-texto-solto";

describe("falaEmTextoSolto", () => {
  it("o modelo escreveu a resposta e não acionou ferramenta nenhuma: o texto sai (o caso medido em produção)", () => {
    expect(falaEmTextoSolto({ text: "  Esperança, meu bem.  ", steps: [{ toolCalls: [] }] }, 0)).toBe("Esperança, meu bem.");
    expect(falaEmTextoSolto({ text: "Oi", steps: null }, 0)).toBe("Oi");
  });

  it("se alguma mensagem já saiu no turno, o texto final não é enviado de novo", () => {
    expect(falaEmTextoSolto({ text: "resumo do que eu disse", steps: [{ toolCalls: [] }] }, 2)).toBeNull();
  });

  it("quem acionou ferramenta e não falou escolheu o silêncio — é respeitado", () => {
    const turno = { text: "passei para a equipe", steps: [{ toolCalls: [{ toolName: "request_human_handoff" }] }, { toolCalls: [] }] };
    expect(falaEmTextoSolto(turno, 0)).toBeNull();
  });

  it("sem texto, nada a enviar", () => {
    expect(falaEmTextoSolto({ text: "   ", steps: [] }, 0)).toBeNull();
    expect(falaEmTextoSolto({ text: null }, 0)).toBeNull();
    expect(falaEmTextoSolto({}, 0)).toBeNull();
  });
});
