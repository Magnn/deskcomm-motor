/**
 * A MEMÓRIA DO LEAD NÃO PARA QUANDO O ÍNDICE DE NOTAS ENCHE.
 *
 * Medido em produção em 09/10/2026: 468 leads tinham o índice no teto (500 tokens, ~1.700
 * caracteres) e o flush de antes da compaction recusava a nota nova 1.329 vezes por dia. O modelo
 * auxiliar não via as notas existentes, então não tinha como consolidar; e a recusa era só um
 * aviso no log. A memória desses leads ficava presa nas primeiras conversas.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FLUSH_INSTRUCTION, instrucaoDeConsolidacao } from "@/lib/agent-engine/agent/compaction";
import { estimateIndexTokens, maisAntigasQueSaemParaCaber } from "@/lib/agent-engine/agent/lead-notes";

const nota = (n: number, headline = `Fato número ${n} sobre a pessoa, com algum detalhe a mais`) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  headline,
});
const TETO = 500;
const cheio = Array.from({ length: 18 }, (_, i) => nota(i + 1));

describe("maisAntigasQueSaemParaCaber", () => {
  it("o cenário medido: 18 notas não cabem com mais uma", () => {
    expect(estimateIndexTokens([...cheio, nota(99)])).toBeGreaterThan(TETO);
  });

  it("⭐ saem as MAIS ANTIGAS, e só o necessário para a nova caber", () => {
    const saem = maisAntigasQueSaemParaCaber(cheio, "Pagou o trabalho no dia 08/10", new Set(), TETO)!;
    expect(saem.length).toBeGreaterThan(0);
    expect(saem).toEqual(cheio.slice(0, saem.length).map((e) => e.id));
    const ficam = cheio.filter((e) => !saem.includes(e.id));
    expect(estimateIndexTokens([...ficam, nota(99, "Pagou o trabalho no dia 08/10")])).toBeLessThanOrEqual(TETO);
    // Tirando uma a menos, não caberia: nada sai à toa.
    const umaAMenos = cheio.filter((e) => !saem.slice(0, -1).includes(e.id));
    expect(estimateIndexTokens([...umaAMenos, nota(99, "Pagou o trabalho no dia 08/10")])).toBeGreaterThan(TETO);
  });

  it("com folga, nada sai; o que o modelo já substituiu não é contado de novo", () => {
    expect(maisAntigasQueSaemParaCaber(cheio.slice(0, 3), "Fato novo", new Set(), TETO)).toEqual([]);
    const substituidas = new Set(cheio.slice(0, 6).map((e) => e.id));
    expect(maisAntigasQueSaemParaCaber(cheio, "Fato novo", substituidas, TETO)).toEqual([]);
  });

  it("nota que nem sozinha cabe continua recusada (null), sem apagar a memória inteira", () => {
    expect(maisAntigasQueSaemParaCaber(cheio, "x".repeat(4_000), new Set(), TETO)).toBeNull();
  });
});

describe("o flush mostra ao modelo o que já está guardado", () => {
  it("sem nota guardada a instrução fixa segue sozinha", () => {
    expect(instrucaoDeConsolidacao([])).toBe("");
  });

  it("⭐ com notas, leva os ids e pede para juntar em vez de repetir", () => {
    const texto = instrucaoDeConsolidacao(cheio.slice(0, 2));
    expect(texto).toContain(cheio[0]!.id);
    expect(texto).toContain(cheio[1]!.headline);
    expect(texto).toContain('"supersedes"');
    expect(texto).toContain("NÃO repita");
    // A instrução fixa não mudou: o marcador de que os outros testes dependem segue o mesmo.
    expect(FLUSH_INSTRUCTION).toContain('{"notes": [{"headline": string, "body": string}]}');
  });

  it("a fiação: o flush lê o índice antes de chamar o modelo e tenta de novo quando o teto recusa", () => {
    const fonte = readFileSync("lib/agent-engine/agent/compaction.ts", "utf8");
    expect(fonte).toContain("FLUSH_INSTRUCTION + instrucaoDeConsolidacao(indiceAtual)");
    expect(fonte.indexOf("const indiceAtual =")).toBeLessThan(fonte.indexOf("purpose: 'flush'"));
    expect(fonte).toContain("maisAntigasQueSaemParaCaber(");
    expect(fonte).toContain("as mais antigas deram lugar à nova");
  });
});
