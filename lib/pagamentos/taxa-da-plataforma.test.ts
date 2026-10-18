import { describe, expect, it } from "vitest";

import { calcularTaxa, regraTemTaxa, SEM_TAXA } from "./taxa-da-plataforma";

const REGRA = { fixoCentavos: 99, percentualBp: 150, tetoCentavos: 990 };

describe("taxa da plataforma: fixo + percentual, com teto", () => {
  it("R$ 0,99 + 1,5% numa venda de R$ 105 dá R$ 2,57", () => {
    expect(calcularTaxa(REGRA, 10_500)).toBe(257);
  });

  it("o teto segura a venda grande", () => {
    expect(calcularTaxa(REGRA, 300_000)).toBe(990); // 0,99 + 45,00 → teto R$ 9,90
  });

  it("sem teto, vale a conta inteira", () => {
    expect(calcularTaxa({ ...REGRA, tetoCentavos: 0 }, 300_000)).toBe(4599);
  });

  it("só fixo e só percentual também valem", () => {
    expect(calcularTaxa({ fixoCentavos: 99, percentualBp: 0, tetoCentavos: 0 }, 6000)).toBe(99);
    expect(calcularTaxa({ fixoCentavos: 0, percentualBp: 200, tetoCentavos: 0 }, 6000)).toBe(120);
  });

  it("nunca vai taxa igual ou maior que a venda, nem com regra zerada", () => {
    expect(calcularTaxa(REGRA, 100)).toBeNull(); // 0,99 + 0,02 = 1,01 ≥ 1,00
    expect(calcularTaxa(SEM_TAXA, 10_500)).toBeNull();
    expect(regraTemTaxa(SEM_TAXA)).toBe(false);
  });
});
