import { describe, expect, it } from "vitest";

import { notaDoTexto } from "./nota-por-texto";

describe("notaDoTexto", () => {
  it("lê o JSON pedido, com cerca de código ou prosa em volta, e número como texto", () => {
    expect(notaDoTexto('{"sentiment_score": 0.2}')).toBe(0.2);
    expect(notaDoTexto('```json\n{"sentiment_score": 0.75, "reasoning_short": "ok"}\n```')).toBe(0.75);
    expect(notaDoTexto('Claro! Aqui está: {"sentiment_score": 1} Espero ter ajudado.')).toBe(1);
    expect(notaDoTexto('{"sentiment_score": "0,4"}')).toBe(0.4);
  });

  it("JSON cortado ainda entrega a nota pelo rótulo; número solto sozinho também vale", () => {
    expect(notaDoTexto('{"sentiment_score": 0.35, "reasoning_short": "a pessoa est')).toBe(0.35);
    expect(notaDoTexto(" 0.3 ")).toBe(0.3);
  });

  it("fora da régua, vazio ou prosa sem nota é null — nunca um palpite", () => {
    expect(notaDoTexto('{"sentiment_score": 7}')).toBeNull();
    expect(notaDoTexto('{"sentiment_score": -0.1}')).toBeNull();
    expect(notaDoTexto("")).toBeNull();
    expect(notaDoTexto("A pessoa parece chateada, mas em 2 ou 3 mensagens melhora.")).toBeNull();
    expect(notaDoTexto('{"outra": 0.5}')).toBeNull();
  });
});
