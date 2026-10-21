import { describe, expect, it } from "vitest";

import { comMarcaDePago, pagouAlgo } from "./oferta-da-vez";

describe("quem pagou só cobrança avulsa", () => {
  it("extra conta como pagamento; devolução não", () => {
    expect(pagouAlgo(["extra:pergunta-nova"])).toBe(true);
    expect(pagouAlgo(["fluxo:cigana-tarot"])).toBe(false);
    expect(pagouAlgo(["extra:pergunta-nova", "reembolso"])).toBe(false);
    expect(comMarcaDePago(["extra:pergunta-nova"])).toEqual(["extra:pergunta-nova", "pago"]);
    expect(comMarcaDePago(["pago"])).toEqual(["pago"]);
    expect(comMarcaDePago(["fluxo:x"])).toEqual(["fluxo:x"]);
  });
});
