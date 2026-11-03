/**
 * Ouvir a leitura (`lib/area-do-cliente/narracao.ts`): o texto vira fala limpa, em trechos que a voz aguenta, e as
 * rotas `/voz` do quiz, da sinastria e da mão atravessam o proxy.
 */
import { describe, expect, it } from "vitest";

import { textoParaFala, trechosParaFala } from "@/lib/area-do-cliente/narracao";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("ouvir a leitura", () => {
  it("tira o que não se fala: markdown, emoji e separadores", () => {
    expect(textoParaFala("## O seu par ✨\n\n**Leão** e _Peixes_\n---\n- primeiro ponto")).toBe("O seu par \n\nLeão e Peixes\n\nprimeiro ponto");
  });

  it("⭐ parte por parágrafo e nenhum trecho passa do teto", () => {
    const longo = Array.from({ length: 40 }, (_, i) => `Frase número ${i} sobre o seu caminho.`).join(" ");
    const trechos = trechosParaFala(`Primeiro parágrafo.\n\n${longo}\n\nÚltimo.`, 300);
    expect(trechos[0]).toBe("Primeiro parágrafo.");
    expect(trechos.at(-1)).toBe("Último.");
    expect(trechos.every((t) => t.length <= 300)).toBe(true);
    expect(trechos.join(" ")).toContain("Frase número 39 sobre o seu caminho.");
  });

  it("as rotas de ouvir atravessam o proxy, e só elas", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(isPublicPath(`/api/v1/area/publica/magno/quiz/par/${id}/voz`)).toBe(true);
    expect(isPublicPath(`/api/v1/area/publica/magno/sinastria/${id}/voz`)).toBe(true);
    expect(isPublicPath(`/api/v1/area/publica/magno/mao/${id}/voz`)).toBe(true);
    expect(isPublicPath(`/api/v1/area/publica/magno/mao/${id}/outra`)).toBe(false);
  });
});
