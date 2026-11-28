import { describe, expect, it } from "vitest";

import { vendaJaReportada } from "./conciliar-vendas";

const venda = new Date("2026-11-24T14:41:00Z");
const em = (iso: string) => ({ created_at: iso });

describe("vendaJaReportada", () => {
  it("sem envio nenhum: falta reportar", () => expect(vendaJaReportada("manual-abc", venda, [])).toBe(false));
  it("o envio da própria cobrança conta, qualquer que seja a hora", () =>
    expect(vendaJaReportada("manual-abc", venda, [{ event_id: "avulsa:manual-abc:Purchase", ...em("2026-11-20T00:00:00Z") }])).toBe(true));
  it("o fechamento do negócio perto da venda é o desta venda", () =>
    expect(vendaJaReportada("manual-abc", venda, [{ event_id: "lead-1:Purchase", ...em("2026-11-24T15:00:00Z") }])).toBe(true));
  it("fechamento de outra venda, dias antes, não cobre esta", () =>
    expect(vendaJaReportada("manual-abc", venda, [{ event_id: "lead-1:Purchase", ...em("2026-11-20T15:00:00Z") }])).toBe(false));
  it("a compra avulsa de OUTRA cobrança não cobre esta", () =>
    expect(vendaJaReportada("manual-abc", venda, [{ event_id: "avulsa:manual-xyz:Purchase", ...em("2026-11-24T14:42:00Z") }])).toBe(false));
  it("venda lançada dias depois da data dela: o fechamento perto do lançamento cobre", () =>
    expect(vendaJaReportada("manual-abc", venda, [{ event_id: "lead-1:Purchase", ...em("2026-11-27T10:00:00Z") }], new Date("2026-11-27T09:50:00Z"))).toBe(true));
});
