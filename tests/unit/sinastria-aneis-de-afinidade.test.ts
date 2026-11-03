/**
 * Anéis de afinidade da sinastria (`aneisDeAfinidade`): conta estável, simétrica, sempre entre 52% e 97%, e o
 * trígono (mesmo elemento) fica acima da quadratura.
 */
import { describe, expect, it } from "vitest";

import { SIGNOS, aneisDeAfinidade, previaDaSinastria } from "@/lib/area-do-cliente/sinastria";

describe("anéis de afinidade", () => {
  it("todo par de signos fica entre 52% e 97%, nos dois sentidos igual", () => {
    for (const a of SIGNOS)
      for (const b of SIGNOS) {
        const x = aneisDeAfinidade(a, b);
        expect(aneisDeAfinidade(b, a)).toEqual(x);
        for (const v of Object.values(x)) expect(v >= 52 && v <= 97).toBe(true);
      }
  });

  it("⭐ trígono (Áries e Leão) soma mais que quadratura (Áries e Câncer)", () => {
    expect(aneisDeAfinidade("Áries", "Leão").total).toBeGreaterThan(aneisDeAfinidade("Áries", "Câncer").total);
  });

  it("a prévia já leva os anéis, para o navegador desenhar", () => {
    expect(previaDaSinastria("1984-02-07", "1997-12-13")?.aneis.total).toBeGreaterThan(0);
  });
});
