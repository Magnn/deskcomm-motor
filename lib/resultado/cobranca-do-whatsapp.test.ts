import { describe, expect, it } from "vitest";

import { montarCobranca } from "./cobranca-do-whatsapp";

const INICIO = new Date("2026-11-01T00:00:00Z");
const linha = (o: Partial<Record<string, string | number | null>>) =>
  ({ canal_id: "c", telefone: "+5569", nome: null, enviadas: 0, gratis: 0, pagas: 0, informadas: 0, ...o }) as never;

describe("montarCobranca", () => {
  it("usa o que o provedor disse por mensagem (5416 em 20/11/2026: 1.016 grátis, 449 pagas)", () => {
    const c = montarCobranca([linha({ canal_id: "5416", enviadas: 1469, gratis: 1016, pagas: 449, informadas: 1465 })], INICIO);
    expect(c.numeros[0]).toMatchObject({ pagas: 449, gratis: 1016, estimada: false, custoCentavos: 1576 });
  });

  it("sem informação do provedor, o que passa da franquia de 1.000 conta como pago, marcado como estimativa", () => {
    const c = montarCobranca([linha({ canal_id: "7336", enviadas: 3411 }), linha({ canal_id: "5230", enviadas: 22 })], INICIO);
    expect(c.numeros[0]).toMatchObject({ canalId: "7336", pagas: 2411, gratis: 1000, estimada: true });
    expect(c.numeros[1]).toMatchObject({ canalId: "5230", pagas: 0, gratis: 22, custoCentavos: 0 });
    expect(c.totalCentavos).toBe(c.numeros[0]!.custoCentavos);
  });
});
