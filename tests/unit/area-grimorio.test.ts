/**
 * O GRIMÓRIO (pedido do dono em 19/10/2026: o que ficou do estudo de experiência). As cartas que já saíram para a
 * pessoa, com quantas vezes e a última pergunta — memória, não coleção.
 */
import { describe, expect, it } from "vitest";

import { montarGrimorio } from "@/lib/area-do-cliente/grimorio";

const carta = (id: number, nome: string) => ({ id, nome, posicao: "x", sentido: `sentido de ${nome}` });

describe("montarGrimorio", () => {
  it("⭐ uma entrada por carta, com vezes e a última pergunta; as que mais saíram primeiro", () => {
    const g = montarGrimorio([
      { modalidade: "tarot", pergunta: "antiga", quando: "2026-10-10T10:00:00Z", cartas: [carta(17, "A Torre"), carta(3, "A Sacerdotisa")] },
      { modalidade: "tarot", pergunta: "recente", quando: "2026-10-18T10:00:00Z", cartas: [carta(17, "A Torre"), carta(19, "O Sol")] },
    ]);
    expect(g.map((c) => [c.nome, c.vezes])).toEqual([
      ["A Torre", 2],
      ["O Sol", 1],
      ["A Sacerdotisa", 1],
    ]);
    expect(g[0]).toMatchObject({ ultimaPergunta: "recente", ultimaVez: "2026-10-18T10:00:00Z", sentido: "sentido de A Torre" });
  });

  it("o mesmo número em baralhos diferentes são cartas diferentes; repetida na mesma leitura conta uma", () => {
    const g = montarGrimorio([
      { modalidade: "tarot", pergunta: "p", quando: "2026-10-18T10:00:00Z", cartas: [carta(3, "A Sacerdotisa"), carta(3, "A Sacerdotisa")] },
      { modalidade: "baralho-cigano", pergunta: "p", quando: "2026-10-18T11:00:00Z", cartas: [carta(3, "O Navio")] },
    ]);
    expect(g).toHaveLength(2);
    expect(g.every((c) => c.vezes === 1)).toBe(true);
  });

  it("sem leitura, sem grimório", () => {
    expect(montarGrimorio([])).toEqual([]);
  });
});
