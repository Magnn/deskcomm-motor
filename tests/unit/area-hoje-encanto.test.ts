/**
 * A ABA HOJE COM HIERARQUIA (pedido do dono em 19/10/2026): a frase do dia, a lembrança da última pergunta e um
 * destaque só por dia.
 *
 * O que este arquivo guarda:
 *  - a frase é a mesma o dia todo para a mesma pessoa, muda entre pessoas e dias, e sai do tema dela;
 *  - nenhuma frase promete resultado nem usa medo, e toda frase tem espanhol (a área é multilíngue);
 *  - a lembrança só vale de 1 a 7 dias depois, e só de leitura revelada;
 *  - o destaque é um só, na ordem aniversário → lembrança → Mesa.
 */
import { describe, expect, it } from "vitest";

import { FRASES_DO_FOCO, FRASES_GERAIS, destaqueDeHoje, fraseDoDia, lembrancaDaMesa } from "@/lib/area-do-cliente/hoje";
import { FOCOS } from "@/lib/area-do-cliente/perfil";
import { DICIONARIO } from "@/lib/i18n/dicionario";

const TODAS = [...FRASES_GERAIS, ...FOCOS.flatMap((f) => FRASES_DO_FOCO[f])];

describe("a frase do dia", () => {
  it("é fixa no dia e varia entre dias e pessoas", () => {
    expect(fraseDoDia("c1", "2026-10-19", "amor")).toBe(fraseDoDia("c1", "2026-10-19", "amor"));
    const dias = new Set(Array.from({ length: 30 }, (_, i) => fraseDoDia("c1", `2026-11-${String(i + 1).padStart(2, "0")}`, null)));
    expect(dias.size).toBeGreaterThan(3);
    const pessoas = new Set(Array.from({ length: 30 }, (_, i) => fraseDoDia(`c${i}`, "2026-10-19", null)));
    expect(pessoas.size).toBeGreaterThan(3);
  });

  it("sai do tema dela (ou das gerais) e, sem tema, só das gerais", () => {
    for (let i = 0; i < 40; i++) {
      const f = fraseDoDia(`c${i}`, "2026-10-19", "dinheiro");
      expect([...FRASES_DO_FOCO.dinheiro, ...FRASES_GERAIS]).toContain(f);
      expect(FRASES_GERAIS).toContain(fraseDoDia(`c${i}`, "2026-10-19", null));
    }
  });

  it("nenhuma promete resultado nem usa medo", () => {
    for (const f of TODAS) {
      expect(f).not.toMatch(/garant|com certeza|vai voltar|vai acontecer|perigo|bloquei|amarra|inveja|olho gordo|urgente|última chance/i);
      expect(f.length).toBeLessThanOrEqual(90);
    }
  });

  it("toda frase tem espanhol no dicionário", () => {
    const sem = TODAS.filter((f) => !(DICIONARIO as Record<string, { es?: string }>)[f]?.es);
    expect(sem).toEqual([]);
  });
});

describe("a lembrança da última pergunta", () => {
  const dia = (iso: string) => iso.slice(0, 10);
  const leitura = (quando: string, revelada = true, pergunta = "Ele pensa em mim?") => ({ pergunta, quando, revelada });

  it("⭐ ontem: lembra da pergunta revelada", () => {
    expect(lembrancaDaMesa([leitura("2026-10-18T22:00:00Z")], "2026-10-19", dia)).toEqual({ pergunta: "Ele pensa em mim?", diasAtras: 1 });
  });

  it("hoje ainda não, mais de 7 dias não, e leitura não revelada não conta", () => {
    expect(lembrancaDaMesa([leitura("2026-10-19T09:00:00Z")], "2026-10-19", dia)).toBeNull();
    expect(lembrancaDaMesa([leitura("2026-10-10T09:00:00Z")], "2026-10-19", dia)).toBeNull();
    expect(lembrancaDaMesa([leitura("2026-10-18T09:00:00Z", false)], "2026-10-19", dia)).toBeNull();
  });

  it("vale a mais recente", () => {
    const r = lembrancaDaMesa([leitura("2026-10-14T09:00:00Z", true, "antiga"), leitura("2026-10-17T09:00:00Z", true, "recente")], "2026-10-19", dia);
    expect(r).toEqual({ pergunta: "recente", diasAtras: 2 });
  });
});

describe("o destaque único", () => {
  const l = { pergunta: "x", diasAtras: 1 };
  it("aniversário → lembrança → Mesa → nada", () => {
    expect(destaqueDeHoje({ aniversario: true, lembranca: l, mesa: true })).toBe("aniversario");
    expect(destaqueDeHoje({ aniversario: false, lembranca: l, mesa: true })).toBe("lembranca");
    expect(destaqueDeHoje({ aniversario: false, lembranca: null, mesa: true })).toBe("mesa");
    expect(destaqueDeHoje({ aniversario: false, lembranca: null, mesa: false })).toBeNull();
  });
});
