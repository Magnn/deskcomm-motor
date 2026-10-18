import { describe, expect, it } from "vitest";

import { diasDoPeriodo, montarRetorno, planoNoPeriodo } from "./retorno-da-plataforma";

const BASE = { conversasAtendidasPelaIa: 40, mensagensDaIa: 300, corposQueSairam: [] as string[], fatos: [], plano: null, dias: 30, cortado: false };

describe("o que a plataforma trouxe", () => {
  it("conta o período em dias começados e o plano proporcional", () => {
    expect(diasDoPeriodo(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z"))).toBe(7);
    expect(diasDoPeriodo(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-01T05:00:00Z"))).toBe(1);
    expect(planoNoPeriodo(19_700, 30)).toBe(19_700);
    expect(planoNoPeriodo(19_700, 7)).toBe(4_597);
  });

  it("links pelo mesmo reconhecimento do funil; vendas são só cobranças positivas; estorno desconta", () => {
    const r = montarRetorno({
      ...BASE,
      corposQueSairam: ["segue o link https://buy.stripe.com/abc", "00020101021226br.gov.bcb.pix0136", "obrigada, até amanhã!"],
      fatos: [
        { tipo: "charge", centavos: 6000, taxaCentavos: 99 },
        { tipo: "charge", centavos: 3500, taxaCentavos: null },
        { tipo: "refund", centavos: -3500, taxaCentavos: null },
      ],
    });
    expect(r.linksDePagamentoEnviados).toBe(2);
    expect(r.vendasPagas).toBe(2);
    expect(r.receitaCentavos).toBe(6000);
    expect(r.custo.taxasCentavos).toBe(99);
  });

  it("custo = plano proporcional + taxas; retorno é receita por real pago", () => {
    const r = montarRetorno({
      ...BASE,
      fatos: [{ tipo: "charge", centavos: 100_000, taxaCentavos: 99 }],
      plano: { nome: "Pro", precoMensalCentavos: 19_700 },
      dias: 30,
    });
    expect(r.custo.plano?.noPeriodoCentavos).toBe(19_700);
    expect(r.custo.totalCentavos).toBe(19_799);
    expect(r.retornoPorReal).toBe(5.1); // 100.000 ÷ 19.799 ≈ 5,05 → 5,1
  });

  it("sem plano pago e sem taxa não inventa retorno", () => {
    const r = montarRetorno({ ...BASE, fatos: [{ tipo: "charge", centavos: 5000, taxaCentavos: null }] });
    expect(r.custo.totalCentavos).toBe(0);
    expect(r.retornoPorReal).toBeNull();
  });
});
