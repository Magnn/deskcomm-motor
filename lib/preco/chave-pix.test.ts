/**
 * O Pix pela chave da empresa: a marca vira código, chave e nome — e nunca passa crua, com valor que o turno
 * não liberou ou sem chave configurada.
 */
import { describe, expect, it } from "vitest";

import { ehCodigoDoPix, splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";

import { blocoDaChavePix, chavePorExtenso, pixPelaChaveNoLugarDaMarca, temMarcaDeChavePix } from "./chave-pix";

const CHAVE = { key: "62.917.956/0001-00", holder: "Arcanum Imperium Digital" };
const base = { chave: CHAVE, valoresPermitidosCents: [13000, 9000, 500], identificador: "conv1234" };

describe("pixPelaChaveNoLugarDaMarca", () => {
  it("⭐ troca a marca pela instrução, pelo código sozinho num balão e pela chave por extenso", () => {
    const saida = pixPelaChaveNoLugarDaMarca({ ...base, corpo: "Claro, Francisco.\n\n[[CHAVE PIX: 130]]\n\nMe avisa quando fizer?" });
    const corpo = "corpo" in saida ? saida.corpo : "";
    expect(corpo).not.toContain("[[");
    expect(corpo).toContain("*R$ 130*");
    expect(corpo).toContain("*Arcanum Imperium Digital*");
    expect(corpo).toContain("CNPJ 62.917.956/0001-00");
    const baloes = splitIntoBubbles(corpo, 300);
    expect(baloes.filter(ehCodigoDoPix)).toHaveLength(1);
    // O que vem antes do código fica junto; o código vai sozinho; o que vem depois fecha a resposta.
    expect(baloes[0]!.startsWith("Claro, Francisco.")).toBe(true);
    expect(baloes.at(-1)).toContain("Me avisa quando fizer?");
  });

  it("aceita o valor escrito com R$ e com centavos", () => {
    expect("corpo" in pixPelaChaveNoLugarDaMarca({ ...base, corpo: "[[CHAVE PIX: R$ 90]]" })).toBe(true);
    expect("corpo" in pixPelaChaveNoLugarDaMarca({ ...base, valoresPermitidosCents: [3750], corpo: "[[chave pix: 37,50]]" })).toBe(true);
  });

  it("⭐ valor que o turno não liberou, duas marcas, marca mal escrita e falta de chave recusam o envio", () => {
    for (const entrada of [
      { ...base, corpo: "[[CHAVE PIX: 20]]" },
      { ...base, corpo: "[[CHAVE PIX: 130]]\n\n[[CHAVE PIX: 90]]" },
      { ...base, corpo: "[[CHAVE PIX: o valor]]" },
      { ...base, chave: null, corpo: "[[CHAVE PIX: 130]]" },
      { ...base, valoresPermitidosCents: [], corpo: "[[CHAVE PIX: 130]]" },
    ]) {
      expect("recusa" in pixPelaChaveNoLugarDaMarca(entrada), entrada.corpo).toBe(true);
    }
  });

  it("sem marca, o corpo passa intacto", () => {
    expect(pixPelaChaveNoLugarDaMarca({ ...base, corpo: "Me conta mais." })).toEqual({ corpo: "Me conta mais." });
    expect(temMarcaDeChavePix("a chave pix é minha")).toBe(false);
  });
});

describe("blocoDaChavePix e chavePorExtenso", () => {
  it("diz quando usar, os valores liberados e que a confirmação é manual; sem chave ou sem valor não há bloco", () => {
    const bloco = blocoDaChavePix(CHAVE, [9000, 13000, 9000]);
    expect(bloco).toContain("[[CHAVE PIX: 130]]");
    expect(bloco).toContain("R$ 130, R$ 90");
    expect(bloco).toContain("NÃO confirma sozinho");
    expect(blocoDaChavePix(null, [13000])).toBe("");
    expect(blocoDaChavePix(CHAVE, [])).toBe("");
  });

  it("escreve CNPJ e CPF com pontuação", () => {
    expect(chavePorExtenso("62917956000100")).toBe("CNPJ 62.917.956/0001-00");
    expect(chavePorExtenso("12345678909")).toBe("CPF 123.456.789-09");
    expect(chavePorExtenso("financeiro@exemplo.com.br")).toBe("financeiro@exemplo.com.br");
  });
});
