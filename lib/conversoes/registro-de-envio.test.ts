import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jaFoiEnviada } from "./registro-de-envio";

describe("identidade de cobrança independente do negócio", () => {
  it("encontra envio de outro negócio da mesma organização, sem buscar noutra organização", async () => {
    const filtros: Record<string, unknown> = {};
    const cadeia = {
      select: () => cadeia, limit: () => cadeia,
      eq: (k: string, v: unknown) => { filtros[k] = v; return cadeia; },
      maybeSingle: async () => ({ data: filtros.organization_id === "org-a" && filtros.event_id === "avulsa:pi_1:Purchase" && !filtros.lead_id ? { status: "sent" } : null }),
    };
    const admin = { from: () => cadeia } as unknown as SupabaseClient;
    expect(await jaFoiEnviada(admin, "org-a", "novo-lead", "Purchase", "avulsa:pi_1:Purchase")).toBe(true);
    expect(filtros).toEqual({ organization_id: "org-a", event_name: "Purchase", event_id: "avulsa:pi_1:Purchase", status: "sent" });
    expect(await jaFoiEnviada(admin, "org-b", "novo-lead", "Purchase", "avulsa:pi_1:Purchase")).toBe(false);
  });

  it("falha de leitura não libera o envio como se fosse uma compra nova", async () => {
    const cadeia = {
      select: () => cadeia, eq: () => cadeia, limit: () => cadeia,
      maybeSingle: async () => ({ data: null, error: { message: "banco indisponível" } }),
    };
    await expect(jaFoiEnviada({ from: () => cadeia } as unknown as SupabaseClient, "org-a", "lead", "Purchase", "avulsa:pi_1:Purchase"))
      .rejects.toThrow("leitura do recibo de conversão falhou");
  });
});
