import { describe, expect, it } from "vitest";

import { MAXIMO_DE_PASSOS_NO_LOG, resumoDosPassos } from "./passos-do-turno";

/**
 * O resumo dos passos vai para o LOG. O que estes testes prendem: sai nome de ferramenta e número, e
 * nunca o texto do modelo nem argumento de ferramenta — é ali que mora dado do cliente.
 */
describe("resumoDosPassos", () => {
  it("um passo por volta do laço: ferramentas pelo nome, tokens e o tamanho do texto", () => {
    const r = resumoDosPassos([
      {
        toolCalls: [{ toolName: "send_message" }, { toolName: "crm_schedule_followup" }],
        text: "",
        usage: { inputTokens: 43000, outputTokens: 180 },
        finishReason: "tool-calls",
      },
      { toolCalls: [], text: "ok, enviado", usage: { inputTokens: 43500, outputTokens: 12 }, finishReason: "stop" },
    ]);
    expect(r).toEqual([
      { ferramentas: ["send_message", "crm_schedule_followup"], entrada: 43000, saida: 180, texto: 0, fim: "tool-calls" },
      { ferramentas: [], entrada: 43500, saida: 12, texto: 11, fim: "stop" },
    ]);
  });

  it("o texto do modelo e os argumentos da ferramenta NÃO saem", () => {
    const passo = {
      toolCalls: [{ toolName: "send_message", input: { text: "Maria, seu CPF é 123" } }],
      text: "Maria disse que o marido saiu de casa",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    const serializado = JSON.stringify(resumoDosPassos([passo]));
    expect(serializado).not.toContain("Maria");
    expect(serializado).not.toContain("CPF");
  });

  it("forma estranha vira zero e lista vazia, sem lançar", () => {
    expect(resumoDosPassos([{}])).toEqual([{ ferramentas: [], entrada: 0, saida: 0, texto: 0, fim: "" }]);
    expect(resumoDosPassos([{ toolCalls: [{ toolName: 7 }, {}], usage: { inputTokens: "muitos" } }])[0]).toMatchObject({
      ferramentas: [],
      entrada: 0,
    });
    expect(resumoDosPassos(null)).toEqual([]);
    expect(resumoDosPassos(undefined)).toEqual([]);
  });

  it("laço que se perdeu não infla o log: corta no teto", () => {
    const muitos = Array.from({ length: MAXIMO_DE_PASSOS_NO_LOG + 9 }, () => ({}));
    expect(resumoDosPassos(muitos)).toHaveLength(MAXIMO_DE_PASSOS_NO_LOG);
  });
});
