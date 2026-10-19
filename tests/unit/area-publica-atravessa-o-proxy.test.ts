/**
 * TODA ROTA PÚBLICA DA ÁREA DO CLIENTE ATRAVESSA O PROXY.
 *
 * Quem chega na área é o comprador, sem usuário no Auth: o `proxy.ts` só deixa passar o que
 * `PUBLIC_PATHS` lista, e a lista da área é ENUMERADA. Em 19/10/2026 as rotas da Mesa e dos créditos
 * (PRs #335 e #336) estavam fora dela: o proxy respondia 401 antes da rota e ninguém conseguia comprar
 * leitura nem créditos — com os testes das rotas verdes, porque eles chamam a rota direto.
 *
 * Este teste varre `app/api/v1/area/publica/[org]/**` e cobra que o caminho de cada rota, com um slug e
 * um UUID no lugar dos segmentos dinâmicos, seja público.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

const RAIZ = join(process.cwd(), "app", "api", "v1", "area", "publica", "[org]");

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return rotas(caminho);
    return nome === "route.ts" ? [caminho] : [];
  });
}

/** O caminho de URL da rota, com valores de exemplo nos segmentos dinâmicos. */
function urlDaRota(arquivo: string): string {
  const partes = relative(RAIZ, arquivo).split(sep).slice(0, -1);
  const exemplo: Record<string, string> = {
    "[id]": "11111111-1111-4111-8111-111111111111",
    "[codigo]": "A".repeat(32),
  };
  return ["/api/v1/area/publica/magno", ...partes.map((p) => exemplo[p] ?? p)].join("/");
}

describe("área do cliente: toda rota pública atravessa o proxy", () => {
  const todas = rotas(RAIZ);

  it("o instrumento acha as rotas (controle)", () => {
    expect(todas.length).toBeGreaterThanOrEqual(20);
  });

  it("⭐ nenhuma rota da área fica atrás do login da equipe", () => {
    const barradas = todas.map(urlDaRota).filter((url) => !isPublicPath(url));
    expect(barradas, "rota da área sem entrada em lib/auth/public-paths.ts: o proxy responde 401 ao comprador").toEqual([]);
  });

  it("a liberação continua ancorada: sub-caminho inventado não passa de carona", () => {
    expect(isPublicPath("/api/v1/area/publica/magno/leituras/11111111-1111-4111-8111-111111111111/outra")).toBe(false);
    expect(isPublicPath("/api/v1/area/publica/magno/leituras/nao-e-uuid/revelar")).toBe(false);
  });
});
