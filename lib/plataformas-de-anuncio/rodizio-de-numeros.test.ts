import { describe, expect, it } from "vitest";

import { sortearNumero } from "./rodizio-de-numeros";

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
    for (let i = 0; i < 3000; i++) conta[sortearNumero(numeros, () => i / 3000)!]++;
    expect(conta).toEqual({ a: 1000, b: 1000, c: 1000 });
  });
});
