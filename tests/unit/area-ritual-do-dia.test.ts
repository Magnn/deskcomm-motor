/** O ritual de hoje da área (`lib/area-do-cliente/ritual.ts`): a ordem dos passos e o passo da vez. */
import { describe, expect, it } from "vitest";

import { passoDaVez, passosDoRitual } from "@/lib/area-do-cliente/ritual";

describe("ritual de hoje", () => {
  it("carta, diário e conversa, nessa ordem; o da vez é o primeiro não feito", () => {
    const p = passosDoRitual({ temCarta: true, cartaHoje: true, diarioHoje: false, conversouHoje: false });
    expect(p.map((x) => x.passo)).toEqual(["carta", "diario", "conversa"]);
    expect(passoDaVez(p)).toBe("diario");
  });
  it("sem carta do dia ligada, começa no diário", () => {
    const p = passosDoRitual({ temCarta: false, cartaHoje: false, diarioHoje: false, conversouHoje: false });
    expect(p.map((x) => x.passo)).toEqual(["diario", "conversa"]);
    expect(passoDaVez(p)).toBe("diario");
  });
  it("conversar fora de ordem conta, e tudo feito = ritual completo", () => {
    const p = passosDoRitual({ temCarta: true, cartaHoje: false, diarioHoje: false, conversouHoje: true });
    expect(passoDaVez(p)).toBe("carta");
    expect(passoDaVez(passosDoRitual({ temCarta: true, cartaHoje: true, diarioHoje: true, conversouHoje: true }))).toBeNull();
  });
});
