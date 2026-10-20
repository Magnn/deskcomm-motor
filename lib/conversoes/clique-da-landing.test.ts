/**
 * O `fbc` da venda vem do clique guardado no `[ref:]` da landing: o cookie `_fbc` repassado pela página, ou montado
 * a partir do `fbclid` com a hora do clique (o formato da Meta: `fb.1.<ms>.<fbclid>`).
 */
import { describe, expect, it } from "vitest";

import { fbcDoClique } from "./destino-de-mensageria";

describe("fbcDoClique", () => {
  it("o cookie _fbc repassado pela página vence", () => {
    expect(fbcDoClique({ _fbc: "fb.1.1760000000000.IwAR0abc", fbclid: "outro" }, "2026-10-20T12:00:00Z")).toBe("fb.1.1760000000000.IwAR0abc");
  });

  it("⭐ sem o cookie, monta do fbclid com a hora do clique", () => {
    expect(fbcDoClique({ fbclid: "IwAR0xyz123" }, "2026-10-20T12:00:00Z")).toBe(`fb.1.${Date.parse("2026-10-20T12:00:00Z")}.IwAR0xyz123`);
  });

  it("valor estranho (espaço, script) não vira identificador; sem nada, null", () => {
    expect(fbcDoClique({ fbclid: "<script>alert(1)</script>" }, "2026-10-20T12:00:00Z")).toBeNull();
    expect(fbcDoClique({}, "2026-10-20T12:00:00Z")).toBeNull();
  });
});
