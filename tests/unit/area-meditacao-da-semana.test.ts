/**
 * A meditação da semana (`lib/area-do-cliente/meditacao.ts` e `meditacao-voz.ts`): feita com o céu da pessoa,
 * muda na segunda-feira, e a narração emenda os trechos com silêncio de verdade.
 */
import { describe, expect, it } from "vitest";

import { duracaoEstimada, meditacaoDaSemana, semanaDaMeditacao } from "@/lib/area-do-cliente/meditacao";
import { narrarTrechos, semId3, silencio } from "@/lib/area-do-cliente/meditacao-voz";
import { isPublicPath } from "@/lib/auth/public-paths";

const base = { semente: "contato-1", nome: "Sandra", foco: "amor" as const };

describe("meditação da semana: o roteiro", () => {
  it("a semana começa na segunda-feira", () => {
    expect(semanaDaMeditacao("2026-11-02")).toBe("2026-11-02"); // segunda
    expect(semanaDaMeditacao("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(semanaDaMeditacao("2026-11-09")).toBe("2026-11-09");
  });

  it("⭐ é feita com o céu dela: nome, Sol, Lua e o foco aparecem", () => {
    const m = meditacaoDaSemana({ ...base, dia: "2026-11-04", ceu: { sol: "Leão", lua: "Peixes" } });
    const texto = m.trechos.map((t) => t.texto).join(" ");
    expect(texto).toContain("Sandra");
    expect(texto).toContain("Sol em Leão");
    expect(texto).toContain("Lua de nascimento está em Peixes");
    expect(texto).toContain("um amor que me trate com cuidado");
    expect(m.feitaCom).toMatch(/^Sol em Leão · Lua em Peixes · lua /);
  });

  it("é a mesma durante a semana e muda na seguinte", () => {
    const seg = meditacaoDaSemana({ ...base, dia: "2026-11-02", ceu: { sol: "Leão", lua: "Peixes" } });
    const dom = meditacaoDaSemana({ ...base, dia: "2026-11-08", ceu: { sol: "Leão", lua: "Peixes" } });
    expect(dom).toEqual(seg);
    const outra = meditacaoDaSemana({ ...base, dia: "2026-11-16", ceu: { sol: "Leão", lua: "Peixes" } });
    expect(outra.semana).toBe("2026-11-16");
    expect(outra.trechos).not.toEqual(seg.trechos);
  });

  it("sem data de nascimento ainda há meditação, sem inventar signo", () => {
    const m = meditacaoDaSemana({ ...base, nome: "", foco: null, dia: "2026-11-04", ceu: null });
    const texto = m.trechos.map((t) => t.texto).join(" ");
    expect(texto).not.toMatch(/Sol em|Lua de nascimento/);
    expect(texto.startsWith("Esta é a sua meditação da semana.")).toBe(true);
  });

  it("tem pausas para respirar e dura alguns minutos; nada de medo nem prazo", () => {
    const m = meditacaoDaSemana({ ...base, dia: "2026-11-04", ceu: { sol: "Touro", lua: "Áries" } });
    expect(m.trechos.reduce((s, t) => s + t.pausa, 0)).toBeGreaterThan(90);
    expect(duracaoEstimada(m)).toBeGreaterThanOrEqual(3);
    expect(m.trechos.map((t) => t.texto).join(" ")).not.toMatch(/morte|doença|perigo|urgente|até o dia/i);
  });
});

describe("meditação da semana: a narração", () => {
  it("o silêncio é feito de quadros MP3 mudos de 24 ms", () => {
    const s = silencio(1.2);
    expect(s.length).toBe(50 * 144);
    expect([...s.subarray(0, 4)]).toEqual([0xff, 0xf3, 0x64, 0xc0]);
    expect(silencio(0).length).toBe(0);
  });

  it("tira a etiqueta ID3 do começo de cada fala", () => {
    const id3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 2]), Buffer.from([9, 9]), Buffer.from([0xff, 0xf3])]);
    expect([...semId3(id3)]).toEqual([0xff, 0xf3]);
    const cru = Buffer.from([0xff, 0xf3, 1]);
    expect(semId3(cru)).toBe(cru);
  });

  it("⭐ emenda as falas NA ORDEM, cada uma seguida do seu silêncio", async () => {
    const trechos = [
      { texto: "um", pausa: 0.048 },
      { texto: "dois", pausa: 0 },
      { texto: "três", pausa: 0.024 },
    ];
    const falar = async (t: string) => {
      await new Promise((r) => setTimeout(r, t === "um" ? 20 : 0)); // a primeira termina por último
      return Buffer.from(`[${t}]`);
    };
    const audio = await narrarTrechos(trechos, falar);
    const esperado = Buffer.concat([Buffer.from("[um]"), silencio(0.048), Buffer.from("[dois]"), Buffer.from("[três]"), silencio(0.024)]);
    expect(audio.equals(esperado)).toBe(true);
  });

  it("a rota atravessa o proxy (a sessão da área é o direito)", () => {
    expect(isPublicPath("/api/v1/area/publica/magno/meditacao")).toBe(true);
    expect(isPublicPath("/api/v1/area/publica/magno/meditacao/outra")).toBe(false);
  });
});
