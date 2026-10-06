import { describe, expect, it } from "vitest";

import { lerJsonTolerante, repararJsonQuaseValido } from "./json-quase-valido";
import { parseCheckpointText } from "./inbound-turn";

const NL = String.fromCharCode(10);

describe("lerJsonTolerante", () => {
  it("JSON certo passa sem tocar; texto sem objeto é undefined", () => {
    expect(lerJsonTolerante('{"a": 1, "b": "x"}')).toEqual({ a: 1, b: "x" });
    expect(lerJsonTolerante("sem json aqui")).toBeUndefined();
  });

  it("quebra de linha crua dentro de string é escapada; fora de string fica como está", () => {
    const texto = `{${NL}  "resumo": "linha um${NL}linha dois",${NL}  "n": 2${NL}}`;
    expect(lerJsonTolerante(texto)).toEqual({ resumo: `linha um${NL}linha dois`, n: 2 });
  });

  it("vírgula sobrando antes de } e ] sai", () => {
    expect(lerJsonTolerante('{"a": [1, 2, ], "b": "x", }')).toEqual({ a: [1, 2], b: "x" });
  });

  it("aspas tipográficas delimitando viram retas; dentro de string reta continuam conteúdo", () => {
    expect(lerJsonTolerante("{“a”: “valor”}")).toEqual({ a: "valor" });
    expect(lerJsonTolerante('{"a": "ela disse “oi”"}')).toEqual({ a: "ela disse “oi”" });
  });

  it("escape já presente não é duplicado, e vírgula dentro de string não some", () => {
    // A barra é montada por código: escrita no fonte, as ferramentas de edição a duplicam ou comem.
    const B = String.fromCharCode(92);
    const certo = `{"a": "aspas ${B}"dentro${B}" e barra ${B}${B} e fim, }"}`;
    expect(JSON.parse(certo)).toEqual({ a: `aspas "dentro" e barra ${B} e fim, }` });
    expect(repararJsonQuaseValido(certo)).toBe(certo);
    expect(lerJsonTolerante(certo)).toEqual({ a: `aspas "dentro" e barra ${B} e fim, }` });
  });

  it("o que não tem conserto continua inválido (não inventa conteúdo)", () => {
    expect(lerJsonTolerante('{"a": "sem fechar}')).toBeUndefined();
    expect(lerJsonTolerante('{"a": }')).toBeUndefined();
  });
});

describe("parseCheckpointText com o fechamento malformado", () => {
  it("resumo com parágrafos crus e vírgula sobrando vira checkpoint, em vez de refazer o turno", () => {
    const texto =
      "```json" + NL +
      `{"commitments": ["mandar o link",], "objections": [], "next_action": null, "rolling_summary": "Primeiro parágrafo.${NL}${NL}Segundo parágrafo.",}` +
      NL + "```";
    const c = parseCheckpointText(texto);
    expect(c.commitments).toEqual(["mandar o link"]);
    expect(c.rolling_summary).toContain("Segundo parágrafo.");
  });

  it("sem JSON nenhum continua sendo erro", () => {
    expect(() => parseCheckpointText("não consegui fechar o turno")).toThrow(/sem JSON de checkpoint/);
  });
});
