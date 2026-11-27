import { describe, expect, it } from "vitest";

import {
  contatosParaAMeta,
  diasEntre,
  lerMetas,
  metaDoDia,
  pesosPorDiaDaSemana,
  planoDaMeta,
  projetarMes,
  ritmoDe,
} from "./meta-de-receita";

const UNIFORME = [1, 1, 1, 1, 1, 1, 1];
const META = 10_000_000; // R$ 100 mil

describe("meta de receita em cascata", () => {
  it("lê só a meta válida da organização", () => {
    expect(lerMetas({ metas: { receita_mensal_cents: META } })).toEqual({ receita_mensal_cents: META });
    expect(lerMetas({ metas: { receita_mensal_cents: -1 } })).toBeNull();
    expect(lerMetas({})).toBeNull();
  });

  it("com pesos uniformes, a soma dos dias do mês é a meta do mês", () => {
    const soma = diasEntre("2026-11-01", "2026-11-30").reduce((s, d) => s + metaDoDia(d, META, UNIFORME), 0);
    expect(Math.round(soma)).toBe(META);
    expect(Math.round(metaDoDia("2026-11-10", META, UNIFORME))).toBe(Math.round(META / 30));
  });

  it("o peso vem do histórico, puxado pela metade para o uniforme", () => {
    const dias = diasEntre("2026-10-04", "2026-10-31"); // 4 semanas, começa num domingo
    const receita = new Map(dias.map((d) => [d, new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? 0 : 100]));
    const pesos = pesosPorDiaDaSemana(receita, dias);
    expect(pesos[0]).toBeCloseTo(0.5); // domingo sem venda pede metade
    expect(pesos[1]).toBeGreaterThan(1);
    expect(pesosPorDiaDaSemana(receita, dias.slice(0, 10))).toEqual(UNIFORME); // pouco histórico
  });

  it("ritmo: atrás de 90% do previsto é atrasada", () => {
    expect(ritmoDe(80, 100)).toBe("atrasada");
    expect(ritmoDe(95, 100)).toBe("no_ritmo");
    expect(ritmoDe(120, 100)).toBe("adiantada");
    expect(ritmoDe(0, 0)).toBe("no_ritmo");
  });

  it("o plano mede dia, semana, mês e trimestre e projeta o fechamento", () => {
    // 27/11/2026 é sexta. Vendeu R$ 422 por dia até ontem e nada hoje.
    const receita = new Map(diasEntre("2026-10-01", "2026-11-26").map((d) => [d, 42_200]));
    const p = planoDaMeta({ metas: { receita_mensal_cents: META }, hoje: "2026-11-27", fracaoDoDia: 0.5, receitaPorDia: receita, pesos: UNIFORME });
    expect(p.mes.meta).toBe(META);
    expect(p.mes.feito).toBe(26 * 42_200);
    expect(p.mes.ritmo).toBe("atrasada");
    expect(p.semana.inicio).toBe("2026-11-23"); // segunda
    expect(p.semana.fim).toBe("2026-11-29");
    expect(p.trimestre.inicio).toBe("2026-10-01");
    expect(p.trimestre.fim).toBe("2026-12-31");
    expect(p.trimestre.meta).toBe(3 * META);
    expect(p.diasQueFaltam).toBe(4);
    expect(p.faltaPorDia).toBe(Math.round((META - 26 * 42_200) / 4));
    expect(p.mes.projecao).toBeLessThan(META);
  });

  it("meta trimestral diferente escala o trimestre e não o mês", () => {
    const p = planoDaMeta({
      metas: { receita_mensal_cents: META, receita_trimestral_cents: 2 * META },
      hoje: "2026-11-27",
      fracaoDoDia: 0,
      receitaPorDia: new Map(),
      pesos: UNIFORME,
    });
    expect(p.mes.meta).toBe(META);
    expect(p.trimestre.meta).toBe(2 * META);
  });

  it("a conta dos contatos: meta ÷ (conversão × gasto por compradora)", () => {
    expect(contatosParaAMeta(META, 0.1, 16_500)).toBe(6061);
    expect(contatosParaAMeta(META, 0, 16_500)).toBeNull();
    expect(projetarMes({ contatos: 2099, compradoras: 140, receita: 1_139_200 }, 27, 30)).toEqual({
      contatos: 2332,
      compradoras: 156,
      receita: 1_265_778,
    });
  });
});
