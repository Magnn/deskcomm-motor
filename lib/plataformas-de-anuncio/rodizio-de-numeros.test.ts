import { describe, expect, it } from "vitest";

import { numeroComMenosCliques, sortearNumero } from "./rodizio-de-numeros";

describe("sortearNumero", () => {
  it("sem número vivo devolve null (a rota usa o número configurado)", () => {
    expect(sortearNumero([])).toBeNull();
  });

  it("cobre todos os números, nas pontas do sorteio inclusive", () => {
    const numeros = ["556981087471", "556981084871", "556981105076"];
    expect(sortearNumero(numeros, () => 0)).toBe(numeros[0]);
    expect(sortearNumero(numeros, () => 0.5)).toBe(numeros[1]);
    expect(sortearNumero(numeros, () => 0.9999)).toBe(numeros[2]);
    expect(sortearNumero(numeros, () => 1)).toBe(numeros[2]);
  });

  it("divide por igual", () => {
    const numeros = ["a", "b", "c"];
    const conta: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      const n = sortearNumero(numeros, () => i / 3000)!;
      conta[n] = (conta[n] ?? 0) + 1;
    }
    expect(conta).toEqual({ a: 1000, b: 1000, c: 1000 });
  });
});

describe("numeroComMenosCliques", () => {
  const numeros = ["a", "b", "c"];

  it("manda para quem recebeu menos", () => {
    expect(numeroComMenosCliques(numeros, new Map([["a", 6], ["b", 5], ["c", 1]]))).toBe("c");
  });

  it("número sem clique nenhum conta zero", () => {
    expect(numeroComMenosCliques(numeros, new Map([["a", 2], ["b", 2]]))).toBe("c");
  });

  it("empate é sorteado só entre os empatados", () => {
    const cliques = new Map([["a", 3], ["b", 1], ["c", 1]]);
    expect(numeroComMenosCliques(numeros, cliques, () => 0)).toBe("b");
    expect(numeroComMenosCliques(numeros, cliques, () => 0.99)).toBe("c");
  });

  it("cliques seguidos saem exatamente divididos", () => {
    const cliques = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const n = numeroComMenosCliques(numeros, cliques, () => 0.5)!;
      cliques.set(n, (cliques.get(n) ?? 0) + 1);
    }
    expect(Object.fromEntries(cliques)).toEqual({ a: 10, b: 10, c: 10 });
  });

  it("sem número vivo devolve null", () => {
    expect(numeroComMenosCliques([], new Map())).toBeNull();
  });
});
