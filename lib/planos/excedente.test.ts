import { describe, expect, it } from "vitest";

import { aInformar, chaveDoInforme, excedenteDoCiclo } from "./excedente";

describe("excedente de conversas", () => {
  it("só conta o que passou da franquia; franquia 0 não mede", () => {
    expect(excedenteDoCiclo(250, 300)).toBe(0);
    expect(excedenteDoCiclo(300, 300)).toBe(0);
    expect(excedenteDoCiclo(312, 300)).toBe(12);
    expect(excedenteDoCiclo(5_000, 0)).toBe(0);
  });

  it("informa só a diferença dentro do ciclo, e zera no ciclo novo", () => {
    expect(aInformar({ excedente: 12, ciclo: "2026-10-17", cicloInformado: null, jaInformado: 0 })).toBe(12);
    expect(aInformar({ excedente: 20, ciclo: "2026-10-17", cicloInformado: "2026-10-17", jaInformado: 12 })).toBe(8);
    expect(aInformar({ excedente: 20, ciclo: "2026-10-17", cicloInformado: "2026-10-17", jaInformado: 20 })).toBe(0);
    // Ciclo novo: o informado do ciclo anterior não desconta nada.
    expect(aInformar({ excedente: 3, ciclo: "2026-11-17", cicloInformado: "2026-10-17", jaInformado: 40 })).toBe(3);
    // Conversa apagada não devolve cobrança.
    expect(aInformar({ excedente: 10, ciclo: "2026-10-17", cicloInformado: "2026-10-17", jaInformado: 12 })).toBe(0);
  });

  it("a chave do informe muda com o total, e repete quando o total repete", () => {
    const org = "00000000-0000-4000-8000-000000000001";
    expect(chaveDoInforme(org, "2026-10-17T03:00:00.000Z", 12)).toBe(`excedente-${org}-2026-10-17-12`);
    expect(chaveDoInforme(org, "2026-10-17T03:00:00.000Z", 12)).toBe(chaveDoInforme(org, "2026-10-17T03:00:00.000Z", 12));
    expect(chaveDoInforme(org, "2026-10-17T03:00:00.000Z", 13)).not.toBe(chaveDoInforme(org, "2026-10-17T03:00:00.000Z", 12));
  });
});
