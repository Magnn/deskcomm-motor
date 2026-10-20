/**
 * O HORÓSCOPO DO DIA da área (do estudo de experiência: o segundo gancho diário). O mesmo texto para o signo no dia,
 * sem medo nem promessa, e com espanhol.
 */
import { describe, expect, it } from "vitest";

import { HOROSCOPO_DO_ELEMENTO, ehSigno, horoscopoDoDia } from "@/lib/area-do-cliente/horoscopo";
import { DICIONARIO } from "@/lib/i18n/dicionario";
import { SIGNOS } from "@/lib/relatorio/astrologia";

const TODOS = Object.values(HOROSCOPO_DO_ELEMENTO).flat();
const dic = DICIONARIO as Record<string, { es?: string }>;

describe("horoscopoDoDia", () => {
  it("⭐ fixo para o signo no dia, varia entre dias, e todo signo tem texto", () => {
    expect(horoscopoDoDia("Leão", "2026-10-20")).toBe(horoscopoDoDia("Leão", "2026-10-20"));
    const dias = new Set(Array.from({ length: 20 }, (_, i) => horoscopoDoDia("Leão", `2026-11-${String(i + 1).padStart(2, "0")}`)));
    expect(dias.size).toBeGreaterThan(2);
    for (const s of SIGNOS) expect(TODOS).toContain(horoscopoDoDia(s, "2026-10-20"));
  });

  it("só aceita signo conhecido", () => {
    expect(ehSigno("Áries")).toBe(true);
    expect(ehSigno("Ofiúco")).toBe(false);
    expect(ehSigno(undefined)).toBe(false);
  });

  it("nenhum texto promete acontecimento nem usa medo", () => {
    for (const f of TODOS) expect(f).not.toMatch(/vai acontecer|com certeza|garant|perigo|cuidado com|azar|inveja|bloquei|urgente/i);
  });

  it("todo texto e todo signo têm espanhol", () => {
    expect([...TODOS, ...SIGNOS].filter((f) => !dic[f]?.es)).toEqual([]);
  });
});
