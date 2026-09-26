import { describe, expect, it } from "vitest";

import { blocosDoSystemDoTurno, foraDeOrdem } from "@/tests/helpers/blocos-do-system-do-turno";

/**
 * O instrumento que os testes de fiação do turno usam para afirmar a ORDEM dos
 * blocos do prompt. Sem controle, um instrumento que devolve `null` sempre
 * ("tudo em ordem") não seria notado — daí estes casos: ele acha a linha real,
 * e ACUSA a ordem trocada e o bloco ausente.
 */
describe("a ordem dos blocos do prompt do turno", () => {
  it("lê a montagem real de inbound-turn.ts (controle: acha a base e ao menos um bloco)", () => {
    const blocos = blocosDoSystemDoTurno();
    expect(blocos[0]).toBe("system");
    expect(blocos.length).toBeGreaterThan(1);
  });

  it("aceita a ordem certa mesmo com blocos no meio", () => {
    expect(foraDeOrdem(["system", "a", "b", "c"], ["system", "c"])).toBeNull();
  });

  it("acusa a ordem trocada", () => {
    expect(foraDeOrdem(["system", "preco", "entrega"], ["system", "entrega", "preco"])).toMatch(/veio antes/);
  });

  it("acusa o bloco que sumiu da montagem", () => {
    expect(foraDeOrdem(["system", "preco"], ["system", "preco", "entrega"])).toMatch(/não está na montagem/);
  });
});
