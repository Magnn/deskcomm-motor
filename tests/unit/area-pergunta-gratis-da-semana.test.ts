/**
 * A pergunta grátis da semana (`gratisDaSemanaLivre`): uma por pessoa de segunda a domingo, no fuso da empresa.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PAGAMENTO_GRATIS } from "@/lib/area-do-cliente/leituras";
import { configDasLeituras, gratisDaSemanaLivre } from "@/lib/area-do-cliente/leituras-servidor";

function adminCom(pagos: string[]) {
  const filtros: Record<string, unknown> = {};
  const b = {
    from: () => b,
    select: () => b,
    eq: (c: string, v: unknown) => ((filtros[c] = v), b),
    gte: () => b,
    limit: async () => ({ data: filtros.pagamento === PAGAMENTO_GRATIS ? pagos.map((p) => ({ pago_at: p })) : [], error: null }),
  };
  return b as never;
}
const ORG = { id: "org", fuso: "America/Sao_Paulo" };

describe("pergunta grátis da semana", () => {
  afterEach(() => vi.useRealTimers());

  it("desligada por padrão", () => {
    expect(configDasLeituras(undefined).gratis_semanal).toBe(false);
    expect(configDasLeituras({ gratis_semanal: true }).gratis_semanal).toBe(true);
  });

  it("⭐ livre se ainda não usou nesta semana; usada se já usou (mesmo no domingo)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T20:00:00Z")); // domingo, 17h em São Paulo
    expect(await gratisDaSemanaLivre(adminCom([]), ORG, "c")).toBe(true);
    expect(await gratisDaSemanaLivre(adminCom(["2026-11-02T13:00:00Z"]), ORG, "c")).toBe(false); // segunda desta semana
  });

  it("a da semana passada não conta: na segunda-feira volta a valer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z")); // segunda, 9h em São Paulo
    expect(await gratisDaSemanaLivre(adminCom(["2026-11-08T20:00:00Z"]), ORG, "c")).toBe(true);
  });

  it("a virada da semana é no fuso da empresa, não em UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    // Domingo 23h30 em São Paulo = segunda 02h30 UTC: ainda é a semana passada para ela.
    expect(await gratisDaSemanaLivre(adminCom(["2026-11-09T02:30:00Z"]), ORG, "c")).toBe(true);
  });
});
