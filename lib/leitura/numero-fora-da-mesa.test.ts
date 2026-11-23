import { describe, expect, it } from "vitest";

import { descontoFalso } from "@/lib/preco/desconto-falso";

import { ehSinteseDasCartas } from "./estado-da-leitura";
import { numerosAnotadosForaDaMesa } from "./numero-fora-da-mesa";
import type { Carta } from "./sorteio";

describe("numerosAnotadosForaDaMesa", () => {
  it("recusa número fora de 1 a 22 dado como anotado", () => {
    expect(numerosAnotadosForaDaMesa("2, 5 e 23, anotado, meu bem. Respira comigo que agora eu viro a sua primeira carta.")).toMatch(/23/);
  });
  it("recusa mais de 3 números anotados", () => {
    expect(numerosAnotadosForaDaMesa("Anotei os números, meu bem. 1, 2, 3 e 5. Vou firmar a sua pergunta.")).toMatch(/mais de 3/);
    expect(numerosAnotadosForaDaMesa("Anotei os números 1, 2, 3 e 5.")).toMatch(/mais de 3/);
  });
  it("deixa passar a escolha válida e o texto sem números", () => {
    expect(numerosAnotadosForaDaMesa("4, 7 e 9, anotado. Respira que a mesa já está respondendo.")).toBeNull();
    expect(numerosAnotadosForaDaMesa("Ele, anotado. Ele entra com você nessa leitura.")).toBeNull();
    expect(numerosAnotadosForaDaMesa("Ele, anotado. Agora me diz 3 números de 1 a 22.")).toBeNull();
    expect(numerosAnotadosForaDaMesa("Fica com o 10 e o 14, o 23 não existe na mesa.")).toBeNull();
  });
});

describe("descontoFalso", () => {
  it("recusa 'consegui deixar' no preço de tabela", () => {
    expect(descontoFalso("Meu bem, consegui deixar o seu trabalho em *R$ 130*, uma vez só.", 13000)).toMatch(/preço de sempre/);
    expect(descontoFalso("Consegui deixar por *130*, sem mensalidade.", 13000)).toMatch(/preço de sempre/);
  });
  it("deixa passar o valor menor e a frase sem conquista", () => {
    expect(descontoFalso("Meu bem, consegui deixar o seu trabalho por *R$ 60*, uma vez só.", 13000)).toBeNull();
    expect(descontoFalso("O seu fica em *R$ 130*, uma vez só, sem mensalidade.", 13000)).toBeNull();
    expect(descontoFalso("consegui deixar por R$ 130", null)).toBeNull();
  });
});

describe("ehSinteseDasCartas", () => {
  const cartas = [{ nome: "O Enforcado" }, { nome: "A Lua" }, { nome: "A Força" }] as unknown as Carta[];
  it("reconhece a síntese pelas cartas juntas ou por duas citadas", () => {
    expect(ehSinteseDasCartas("Juntando as três, o que as cartas mostram é que o amor não se apagou.", cartas)).toBe(true);
    expect(ehSinteseDasCartas("Olhando as três juntas: a névoa e a escolha.", cartas)).toBe(true);
    expect(ehSinteseDasCartas("O Enforcado mostrou a pausa. A Lua mostrou a névoa.", cartas)).toBe(true);
  });
  it("não confunde a revelação de uma carta com a síntese", () => {
    expect(ehSinteseDasCartas("CARTA 3: A Força (carta número 9 da mesa).", cartas)).toBe(false);
    expect(ehSinteseDasCartas("A carta mostra que você tem força de sobra, mas vem usando ela apertando.", cartas)).toBe(false);
  });
});
