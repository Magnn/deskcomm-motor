import { describe, expect, it } from "vitest";

import { BOLETO_MINIMO_CENTS, blocoDoBoletoPronto, valoresDoBoleto } from "@/lib/preco/boleto-pronto";

import { instrucaoDoPixCopiaECola } from "./como-pagar-pix";

describe("instrucaoDoPixCopiaECola", () => {
  it("diz onde colar e onde NÃO colar", () => {
    const t = instrucaoDoPixCopiaECola("R$ 5,00", "o nome da empresa de pagamentos");
    expect(t).toContain("*Pix Copia e Cola*");
    expect(t).toContain("Pagar com chave");
    expect(t).toContain("R$ 5,00");
    expect(t).toContain("No banco aparece o nome da empresa de pagamentos");
  });
});

describe("boleto tem valor mínimo", () => {
  it("valor abaixo do mínimo não vira boleto nem entra no bloco", () => {
    expect(BOLETO_MINIMO_CENTS).toBe(2000);
    expect(valoresDoBoleto([500, 3700, 13000, 500])).toEqual([13000, 3700]);
    expect(blocoDoBoletoPronto([500])).toBe("");
    expect(blocoDoBoletoPronto([500, 6000])).not.toContain("R$ 5,00");
  });
});
