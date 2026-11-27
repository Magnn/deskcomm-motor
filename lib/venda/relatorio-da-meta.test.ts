import { describe, expect, it } from "vitest";

import { diasEntre, planoDaMeta } from "./meta-de-receita";
import type { PainelDeEscala } from "./painel-de-escala";
import { textoDoRelatorioDoDia } from "./relatorio-da-meta";

const reais = (c: number) => `R$ ${(c / 100).toFixed(0)}`;
const UNIFORME = [1, 1, 1, 1, 1, 1, 1];

function painel(comMeta: boolean): PainelDeEscala {
  const receita = new Map(diasEntre("2026-11-01", "2026-11-26").map((d) => [d, 42_200]));
  const metas = comMeta ? { receita_mensal_cents: 10_000_000 } : null;
  return {
    hoje: "2026-11-27",
    fuso: "America/Sao_Paulo",
    diasCorridos: 27,
    diasDoMes: 30,
    metas,
    plano: metas ? planoDaMeta({ metas, hoje: "2026-11-27", fracaoDoDia: 0.3, receitaPorDia: receita, pesos: UNIFORME }) : null,
    pesos: UNIFORME,
    funil: { mes: { contatos: 2099, compradoras: 140, receita: 1_139_200 }, mesPassado: { contatos: 0, compradoras: 0, receita: 0 } },
    faixas: [],
    recompra: { compradoras: 0, recompraram: 0, maiorGasto: 0 },
    numeros: [],
    anuncios: { estado: "ok", gastoDoMes: 0 },
    assinaturasAtivas: 0,
    porDia: [...receita].map(([dia, r]) => ({ dia, receita: r, meta: null })),
  };
}

describe("relatório do dia da meta", () => {
  it("sem meta não há relatório", () => {
    expect(textoDoRelatorioDoDia(painel(false), reais)).toBeNull();
  });

  it("diz ontem contra a meta, o ritmo e o que falta por dia", () => {
    const r = textoDoRelatorioDoDia(painel(true), reais)!;
    expect(r.titulo).toBe("Meta do dia — 27/11");
    expect(r.severidade).toBe("warn");
    expect(r.corpo).toContain("Ontem: R$ 422 de R$ 3333 (13%).");
    expect(r.corpo).toContain("atrasada");
    expect(r.corpo).toContain("nos 4 dias que faltam");
    expect(r.corpo).toContain("140 compradoras (6.7%)");
  });
});
