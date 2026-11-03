/**
 * O Plano da Semana (`lib/area-do-cliente/plano-semanal.ts`, migration 0953): 7 dias por pagamento sem perder dia,
 * R$ 5 / US$ 1 / € 1 de padrão, o preço por moeda sai da configuração e a rota atravessa o proxy.
 */
import { describe, expect, it } from "vitest";

import { moedaDaOferta, precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { configDoPlanoSemanal, estenderPlano, planoAtivo } from "@/lib/area-do-cliente/plano-semanal";
import { configDaAreaSchema } from "@/lib/area-do-cliente/config";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("Plano da Semana", () => {
  it("⭐ cada pagamento soma 7 dias a partir do vencimento, sem perder dia; vencido conta de agora", () => {
    const agora = new Date("2026-11-03T12:00:00Z");
    expect(estenderPlano(new Date("2026-11-05T12:00:00Z"), agora).toISOString()).toBe("2026-11-12T12:00:00.000Z");
    expect(estenderPlano(new Date("2026-10-01T00:00:00Z"), agora).toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(estenderPlano(null, agora).toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(planoAtivo("2026-11-10T12:00:00Z", agora)).toBe(true);
    expect(planoAtivo("2026-11-01T12:00:00Z", agora)).toBe(false);
    expect(planoAtivo(null, agora)).toBe(false);
  });

  it("desligado por padrão; R$ 5, US$ 1 e € 1 quando a empresa não muda", () => {
    const c = configDoPlanoSemanal(undefined);
    expect(c).toMatchObject({ ativo: false, nome: "Plano da Semana", preco_cents: 500 });
    expect(precoDaOferta(c, "BRL")).toBe(500);
    expect(precoDaOferta(c, "USD")).toBe(100);
    expect(precoDaOferta(c, "EUR")).toBe(100);
  });

  it("a moeda vem do fuso: Lisboa paga em euro, Nova York em dólar, Porto Velho em reais", () => {
    const c = configDoPlanoSemanal({ ativo: true });
    expect(moedaDaOferta(c, "Europe/Lisbon")).toBe("EUR");
    expect(moedaDaOferta(c, "America/New_York")).toBe("USD");
    expect(moedaDaOferta(c, "America/Porto_Velho")).toBe("BRL");
  });

  it("a configuração aceita o bloco do plano com preço por moeda", () => {
    const r = configDaAreaSchema.safeParse({
      plano_semanal: { ativo: true, nome: "Plano da Lua", preco_cents: 500, precos_internacionais: [{ currency: "USD", price_cents: 100 }] },
    });
    expect(r.success).toBe(true);
  });

  it("a rota do plano atravessa o proxy", () => {
    expect(isPublicPath("/api/v1/area/publica/magno/plano-semanal")).toBe(true);
    expect(isPublicPath("/api/v1/area/publica/magno/plano-semanal/outra")).toBe(false);
  });
});
