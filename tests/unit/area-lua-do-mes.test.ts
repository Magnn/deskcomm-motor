/**
 * "SUA LUA DO MÊS" (pedido do dono em 19/10/2026: o que ficou do estudo de experiência — o modelo Wrapped).
 *
 * O que este arquivo guarda:
 *  - o resumo conta só o mês, no fuso da empresa, e escolhe a carta que mais saiu (no empate, a mais recente);
 *  - sem leitura nem diário no mês, não há cartão;
 *  - a imagem nunca leva a pergunta nem o texto do diário (a rota nem os lê);
 *  - os nomes dos meses têm espanhol.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NOMES_DOS_MESES, nomeDoMes, resumoDaLuaDoMes, temLuaDoMes } from "@/lib/area-do-cliente/lua-do-mes";
import { DICIONARIO } from "@/lib/i18n/dicionario";

const diaDe = (iso: string) => iso.slice(0, 10);
const leitura = (quando: string, ...nomes: string[]) => ({ quando, cartas: nomes.map((nome) => ({ nome })) });

describe("resumoDaLuaDoMes", () => {
  it("⭐ só o mês: a carta que mais saiu, as perguntas e as páginas", () => {
    const r = resumoDaLuaDoMes({
      mes: "2026-10",
      leituras: [leitura("2026-09-30T23:00:00Z", "A Morte", "A Morte"), leitura("2026-10-02T10:00:00Z", "A Torre", "O Sol"), leitura("2026-10-15T10:00:00Z", "A Torre")],
      diario: [{ quando: "2026-10-03T10:00:00Z" }, { quando: "2026-09-29T10:00:00Z" }],
      diaDe,
    });
    expect(r).toEqual({ mes: "2026-10", cartaDoMes: "A Torre", perguntas: 2, paginas: 1 });
  });

  it("no empate, a carta que saiu por último", () => {
    const r = resumoDaLuaDoMes({ mes: "2026-10", leituras: [leitura("2026-10-02T10:00:00Z", "O Sol"), leitura("2026-10-09T10:00:00Z", "A Lua")], diario: [], diaDe });
    expect(r.cartaDoMes).toBe("A Lua");
  });

  it("sem leitura nem diário no mês, não há cartão; só com diário, há (sem carta do mês)", () => {
    expect(temLuaDoMes(resumoDaLuaDoMes({ mes: "2026-10", leituras: [], diario: [], diaDe }))).toBe(false);
    const soDiario = resumoDaLuaDoMes({ mes: "2026-10", leituras: [], diario: [{ quando: "2026-10-05T10:00:00Z" }], diaDe });
    expect(temLuaDoMes(soDiario)).toBe(true);
    expect(soDiario.cartaDoMes).toBeNull();
  });

  it("o nome do mês", () => {
    expect(nomeDoMes("2026-10")).toBe("outubro");
    for (const m of NOMES_DOS_MESES) expect((DICIONARIO as Record<string, { es?: string }>)[m]?.es, m).toBeTruthy();
  });
});

describe("a imagem não expõe o que é dela", () => {
  it("a rota não lê a pergunta nem o texto do diário", () => {
    const rota = readFileSync("app/c/[org]/lua-do-mes/route.tsx", "utf8");
    const selects = [...rota.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(selects.join(",")).not.toMatch(/pergunta|texto/);
    expect(rota).toContain("if (!sessao)");
  });
});
