/**
 * A MEMÓRIA DA ORGANIZAÇÃO TEM TETO, E A IA SÓ SUGERE.
 *
 * Medido em produção em 10/10/2026: o agente gravou 79 anotações em quinze dias, todas ativas na
 * hora, e elas eram 44% do que ele relia a cada passo. Entre elas havia casos de clientes citados
 * pelo nome, regras de preço vencidas e instruções de desistir do cliente — nenhuma lida por alguém.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { aprendizadosQueCabem, TETO_DE_CARACTERES_DOS_APRENDIZADOS } from "@/lib/memoria-da-org/teto";

const nota = (id: string, source: string, chars: number, created_at: string) => ({
  id,
  title: "t".repeat(10),
  body: "b".repeat(chars - 10),
  source,
  created_at,
});

describe("aprendizadosQueCabem", () => {
  it("o que uma pessoa escreveu ou aprovou cabe sempre, mesmo acima do teto", () => {
    const entradas = [nota("m1", "manual", 15_000, "2026-10-01"), nota("f1", "flywheel", 15_000, "2026-10-02")];
    const { dentro, fora } = aprendizadosQueCabem(entradas);
    expect([...dentro].sort()).toEqual(["f1", "m1"]);
    expect(fora).toBe(0);
  });

  it("⭐ o que a IA anotou entra do mais recente para o mais antigo, até o teto", () => {
    const entradas = [
      nota("a-velha", "agent", 8_000, "2026-10-01"),
      nota("a-media", "agent", 8_000, "2026-10-05"),
      nota("a-nova", "agent", 8_000, "2026-10-09"),
    ];
    const { dentro, fora } = aprendizadosQueCabem(entradas);
    expect([...dentro].sort()).toEqual(["a-media", "a-nova"]);
    expect(fora).toBe(1);
  });

  it("o espaço da IA é o que sobra depois do que é da pessoa", () => {
    const entradas = [nota("m1", "manual", 15_000, "2026-10-01"), nota("a1", "agent", 4_000, "2026-10-08"), nota("a2", "agent", 4_000, "2026-10-09")];
    const { dentro, fora } = aprendizadosQueCabem(entradas);
    expect(dentro.has("m1")).toBe(true);
    expect(dentro.has("a2")).toBe(true);
    expect(dentro.has("a1")).toBe(false);
    expect(fora).toBe(1);
  });

  it("depois da primeira que não cabe, as mais antigas também ficam de fora", () => {
    // A pequena e velha NÃO entra no lugar da grande que estourou: a regra é uma linha de corte.
    const entradas = [nota("nova", "agent", 12_000, "2026-10-09"), nota("grande", "agent", 12_000, "2026-10-08"), nota("pequena", "agent", 100, "2026-10-01")];
    const { dentro, fora } = aprendizadosQueCabem(entradas);
    expect([...dentro]).toEqual(["nova"]);
    expect(fora).toBe(2);
  });

  it("sem origem declarada conta como escrita por pessoa; lista vazia não quebra", () => {
    expect(aprendizadosQueCabem([{ id: "x", title: "a", body: "b".repeat(TETO_DE_CARACTERES_DOS_APRENDIZADOS * 2) }]).fora).toBe(0);
    expect(aprendizadosQueCabem([])).toEqual({ dentro: new Set(), fora: 0 });
  });
});

describe("a fiação", () => {
  it("⭐ a ferramenta da IA grava SUGESTÃO, não aprendizado ativo — e proíbe dado de cliente", () => {
    const fonte = readFileSync("lib/mcp/tools/evolucao.ts", "utf8");
    const ferramenta = fonte.slice(fonte.indexOf('name: "crm_save_org_memory"'));
    const corpo = ferramenta.slice(0, ferramenta.indexOf("return { anotacao: data }"));
    expect(corpo).toContain('status: "proposed"');
    expect(corpo).not.toContain('status: "active"');
    expect(corpo).toContain("NUNCA cite");
  });

  it("o prompt do agente só leva o que cabe no teto", () => {
    const fonte = readFileSync("lib/agent-engine/agent/org-memory.ts", "utf8");
    expect(fonte).toContain("aprendizadosQueCabem(entryRows)");
    expect(fonte).toContain("and status = 'active'");
  });

  it("a tela de Memória recebe as sugeridas, para alguém aprovar", () => {
    const rota = readFileSync("app/api/v1/ai/memory/route.ts", "utf8");
    expect(rota).not.toContain('.neq("status", "proposed")');
  });
});
