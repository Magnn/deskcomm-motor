import { describe, expect, it } from "vitest";

import { precisaConverter, prepararSticker, STICKER_ORIGEM_MAX_BYTES } from "./sticker-no-navegador";

const TETO_WEBP = 500 * 1024;
const arquivo = (tipo: string, bytes: number, nome = "a") => new File([new Uint8Array(bytes)], nome, { type: tipo });

/**
 * A conversão em si usa canvas e roda no navegador — é provada na tela
 * (harness com Chromium). Aqui fica a DECISÃO, que não depende de canvas: o que
 * passa intacto, o que é recusado antes de qualquer trabalho.
 */
describe("sticker no navegador — a decisão antes do canvas", () => {
  it(".webp que já cabe passa intacto (é o caso do sticker animado)", () => {
    expect(precisaConverter("image/webp", 300 * 1024, TETO_WEBP)).toBe(false);
  });

  it("JPG, PNG e .webp grande demais precisam ser convertidos", () => {
    expect(precisaConverter("image/png", 10 * 1024, TETO_WEBP)).toBe(true);
    expect(precisaConverter("image/jpeg", 10 * 1024, TETO_WEBP)).toBe(true);
    expect(precisaConverter("image/webp", 600 * 1024, TETO_WEBP)).toBe(true);
  });

  it("formato fora da lista é recusado sem tentar converter", async () => {
    expect(await prepararSticker(arquivo("image/gif", 1024), TETO_WEBP)).toEqual({ ok: false, motivo: "formato" });
  });

  it("origem acima de 2 MB é recusada com o motivo", async () => {
    const r = await prepararSticker(arquivo("image/png", STICKER_ORIGEM_MAX_BYTES + 1), TETO_WEBP);
    expect(r).toEqual({ ok: false, motivo: "grande_demais" });
  });

  it(".webp pequeno devolve o MESMO arquivo, sem recodificar", async () => {
    const original = arquivo("image/webp", 50 * 1024, "fig.webp");
    const r = await prepararSticker(original, TETO_WEBP);
    expect(r.ok && r.arquivo).toBe(original);
  });
});
