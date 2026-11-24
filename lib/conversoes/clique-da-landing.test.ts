/**
 * O `fbc` da venda vem do clique guardado no `[ref:]` da landing: o cookie `_fbc` repassado pela página, ou montado
 * a partir do `fbclid` com a hora do clique (o formato da Meta: `fb.1.<ms>.<fbclid>`).
 */
import { describe, expect, it } from "vitest";

import { clienteDoClique, fbcDoClique } from "./destino-de-mensageria";

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

describe("destinoDaConversaoMeta com clique da página (19–20/11/2026: ctwa_clid inválido)", () => {
  it("vai ao pixel do site sem nem consultar o canal oficial", async () => {
    const { destinoDaConversaoMeta } = await import("./destino-de-mensageria");
    const tabelas: string[] = [];
    const consulta: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order", "limit"]) consulta[m] = () => consulta;
    consulta.maybeSingle = async () => ({
      data: { query_raw: { fbclid: "IwAR0xyz123", _fbp: "fb.1.1.123456789" }, created_at: "2026-11-20T12:00:00Z" },
      error: null,
    });
    const admin = { from: (t: string) => { tabelas.push(t); return consulta; } };
    const daTela = { datasetId: "pixel-965", accessToken: "tk" } as never;
    const fetchQueFalha = (() => { throw new Error("não devia chamar a Meta"); }) as unknown as typeof fetch;
    const d = await destinoDaConversaoMeta(admin as never, "org", "contato", daTela, fetchQueFalha, true);
    expect(d.ok && d.pixelDoSite).toBe(true);
    expect(d.ok && d.fbc).toBe(`fb.1.${Date.parse("2026-11-20T12:00:00Z")}.IwAR0xyz123`);
    expect(tabelas).toEqual(["meta_ads_click_refs"]);
  });
});

describe("clienteDoClique", () => {
  it("⭐ leva o visitante e o país que a página repassou, junto do IP e do navegador", () => {
    expect(clienteDoClique({ _vid: "v-mi1x2y-ab12cd34", _pais: "BR" }, "200.1.2.3", "UA")).toEqual({ ip: "200.1.2.3", ua: "UA", visitante: "v-mi1x2y-ab12cd34", pais: "br" });
  });
  it("valor estranho não entra; sem nada, null", () => {
    expect(clienteDoClique({ _vid: "<x>", _pais: "brasil" }, "1.1.1.1", null)).toEqual({ ip: "1.1.1.1", ua: null });
    expect(clienteDoClique({}, null, null)).toBeNull();
  });
});
