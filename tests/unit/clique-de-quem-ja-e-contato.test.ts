import fs from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { casarClickRef } from "@/lib/plataformas-de-anuncio/meta/captura-de-clique";

/**
 * 20/11/2026: 4 de 32 entradas do dia eram de quem já tinha conversado e voltou pelo anúncio com o `[ref:…]`.
 * A regra "só na primeira mensagem do contato" deixava o clique solto, e o nosso número de leads saía abaixo do
 * Gerenciador. O ref é de uso único e recente: quem já é contato casa o clique de até 24 h, sem tocar a origem.
 */
function adminFalso(linha: unknown) {
  const filtros: [string, string, unknown][] = [];
  const cadeia: Record<string, unknown> = {};
  for (const m of ["eq", "is", "gte"]) {
    cadeia[m] = (col: string, v: unknown) => {
      filtros.push([m, col, v]);
      return cadeia;
    };
  }
  cadeia.select = () => cadeia;
  cadeia.maybeSingle = async () => ({ data: linha, error: null });
  const admin = { from: () => ({ update: () => cadeia }) } as unknown as SupabaseClient;
  return { admin, filtros };
}

describe("clique de quem já é contato", () => {
  it("com prazo, só casa clique feito depois do instante pedido", async () => {
    const { admin, filtros } = adminFalso({ utm: { utm_source: "meta" } });
    const desde = new Date("2026-11-19T15:00:00Z");
    expect(await casarClickRef(admin, "org", "BHQ7ZX", "contato", desde)).toEqual({ utm: { utm_source: "meta" } });
    expect(filtros).toContainEqual(["gte", "created_at", desde.toISOString()]);
    expect(filtros).toContainEqual(["is", "matched_at", null]);
  });
  it("sem prazo (primeira mensagem), o casamento segue como antes", async () => {
    const { admin, filtros } = adminFalso({ utm: { utm_source: "meta" } });
    await casarClickRef(admin, "org", "BHQ7ZX", "contato");
    expect(filtros.some(([m]) => m === "gte")).toBe(false);
  });
  it("na entrada, quem já é contato casa o ref com a janela de 24 h e NÃO estampa a origem", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "lib/channels/pos-entrada.ts"), "utf8");
    const i = fonte.indexOf("QUEM JÁ É CONTATO E VOLTA PELO ANÚNCIO");
    expect(i).toBeGreaterThan(0);
    const bloco = fonte.slice(i, fonte.indexOf("fora da primeira mensagem (ignorado)", i));
    expect(bloco).toMatch(/JANELA_DO_CLIQUE_DE_QUEM_VOLTA_MS/);
    expect(bloco).toMatch(/return;/);
    expect(bloco).not.toMatch(/estamparOrigemDaPagina/);
    expect(fonte).toMatch(/JANELA_DO_CLIQUE_DE_QUEM_VOLTA_MS = 24 \* 60 \* 60 \* 1000/);
  });
});
