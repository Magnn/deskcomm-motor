import { describe, expect, it } from "vitest";

import { escolherOferta, ofertasDoCatalogo } from "@/lib/oferta-proativa/decisao";
import { lerOfertaProativa } from "@/lib/oferta-proativa/config";
import { cobrancaDaVez, cobrancaDoTema } from "@/lib/preco/extras";
import { chaveDoProduto, faltaParaAMeta, lerMetaDoMes, pelaMeta, progressoDaMeta, vendidosPorProduto, type MetaDoMes } from "./meta-do-mes";

const meta = (vendidos: Record<string, number>, geral = 150, porProduto: Record<string, number> = {}): MetaDoMes => ({
  meta: geral,
  vendidos: new Map(Object.entries(vendidos).map(([k, v]) => [chaveDoProduto(k), v])),
  porProduto: new Map(Object.entries(porProduto).map(([k, v]) => [chaveDoProduto(k), v])),
});
const ela = (body: string) => ({ direction: "inbound", body });

describe("meta do mês por produto", () => {
  it("a chave junta os jeitos de escrever o mesmo produto", () => {
    expect(chaveDoProduto("2× Oração dos Sonhos")).toBe("oracao dos sonhos");
    expect(chaveDoProduto("oracao_dos_sonhos")).toBe("oracao dos sonhos");
  });

  it("soma o livro por produto e calcula quanto falta, com meta própria vencendo a geral", () => {
    const v = vendidosPorProduto([
      { produto: "Pergunta nova", n: 70 },
      { produto: "2× Pergunta nova", n: "1" },
      { produto: null, n: 3 },
    ]);
    expect(v.get("pergunta nova")).toBe(71);
    const m = { meta: 150, vendidos: v, porProduto: new Map([["circulo", 100]]) };
    expect(faltaParaAMeta("Pergunta nova", m)).toBe(79);
    expect(faltaParaAMeta("Círculo", m)).toBe(100);
    expect(faltaParaAMeta("Pergunta nova", { meta: 50, vendidos: v })).toBe(0);
  });

  it("ordena pelo mais atrás e, no empate ou sem meta, mantém a ordem do operador", () => {
    const itens = ["Pergunta nova", "Oração dos Sonhos", "Sons Vocálicos"];
    expect(pelaMeta(itens, (x) => x, meta({ "Pergunta nova": 71, "Oração dos Sonhos": 12, "Sons Vocálicos": 6 }))).toEqual([
      "Sons Vocálicos",
      "Oração dos Sonhos",
      "Pergunta nova",
    ]);
    expect(pelaMeta(itens, (x) => x, null)).toEqual(itens);
    expect(pelaMeta(itens, (x) => x, meta({}))).toEqual(itens);
  });

  it("o tema vence a meta; a meta desempata entre as que casam com a fala", () => {
    const extras = [
      { name: "Recado do Coração", themes: ["ele"] },
      { name: "Sinastria Amorosa", themes: ["ele"] },
      { name: "Proteção dos Filhos", themes: ["filho"] },
    ];
    const m = meta({ "Recado do Coração": 40, "Sinastria Amorosa": 9, "Proteção dos Filhos": 0 });
    // Falou dele: o filho (mais atrás) não entra; entre as duas do tema, a mais atrás.
    expect(cobrancaDoTema(extras, [ela("ele sumiu")], m)?.name).toBe("Sinastria Amorosa");
    expect(cobrancaDoTema(extras, [ela("ele sumiu")])?.name).toBe("Recado do Coração");
    // Sem tema: a meta decide entre todas.
    expect(cobrancaDaVez(extras, [ela("oi")], m)?.name).toBe("Proteção dos Filhos");
    expect(cobrancaDaVez(extras, [ela("oi")])?.name).toBe("Recado do Coração");
  });

  it("a oferta proativa nunca ouvida vai pela meta do produto que ela vende", () => {
    const cfg = lerOfertaProativa({
      oferta_proativa: {
        enabled: true,
        ofertas: [
          { id: "pergunta_nova", motivo: "ofereça a pergunta nova para quem recebeu a leitura", produto: "Pergunta nova" },
          { id: "oracao_dos_sonhos", motivo: "ofereça a oração dos sonhos para quem já comprou", produto: "Oração dos Sonhos" },
        ],
      },
    })!;
    const pessoa = { comprou: true, produtosComprados: [], compras: [], falas: [], saidas: [], ofertasFeitas: [] };
    const agora = new Date("2026-11-27T15:00:00Z");
    expect(escolherOferta(pessoa, cfg, agora).oferta?.id).toBe("pergunta_nova");
    expect(escolherOferta(pessoa, cfg, agora, [], meta({ "Pergunta nova": 71, "Oração dos Sonhos": 12 })).oferta?.id).toBe("oracao_dos_sonhos");
  });

  it("as ofertas automáticas declaram o produto que vendem", () => {
    const o = ofertasDoCatalogo(
      { extras: [{ name: "Proteção dos Filhos", when: "quando a dor é um filho", themes: ["filho"] }], produto: null },
      ["meu filho anda com más companhias"],
      { ofertas: [] },
    );
    expect(o[0]?.produto).toBe("Proteção dos Filhos");
  });

  it("sem meta configurada não lê o banco; leitura que falha não vira meta", async () => {
    let chamou = false;
    const pool = { query: async () => { chamou = true; throw new Error("fora"); } } as never;
    expect(await lerMetaDoMes(pool, "org-a", {})).toBeNull();
    expect(chamou).toBe(false);
    expect(await lerMetaDoMes(pool, "org-b", { meta_mensal_por_produto: 150 })).toBeNull();
    expect(chamou).toBe(true);
  });

  it("o cartão do painel mostra cada produto contra a sua meta, com o ritmo do mês", () => {
    const linhas = progressoDaMeta(
      ["Pergunta nova", "Círculo", "Oração dos Sonhos"],
      [{ notes: "Pergunta nova" }, { notes: "2× Pergunta nova" }, { notes: "Círculo" }, { notes: null }],
      { meta_mensal_por_produto: 150, metas_por_produto: { "Círculo": 100 } },
      10,
      30,
    )!;
    expect(linhas.map((l) => l.produto)).toEqual(["Oração dos Sonhos", "Pergunta nova", "Círculo"]);
    expect(linhas.find((l) => l.produto === "Círculo")).toEqual({ produto: "Círculo", vendidos: 1, meta: 100, ritmo: 3 });
    expect(linhas.find((l) => l.produto === "Pergunta nova")).toMatchObject({ vendidos: 2, meta: 150, ritmo: 6 });
    expect(progressoDaMeta(["x"], [], {}, 1, 30)).toBeNull();
  });
});
