import { afterEach, describe, expect, it } from "vitest";

import { descontarIa, enderecoDaPtax, lerCotacaoDoDolar, limparCacheDaCotacao, ultimaCotacao } from "./cotacao-do-dolar";

const RESPOSTA = {
  value: [
    { cotacaoVenda: 5.0564, dataHoraCotacao: "2026-10-19 13:05:47.20983" },
    { cotacaoVenda: 5.014, dataHoraCotacao: "2026-10-20 13:09:36.250006" },
  ],
};

afterEach(() => limparCacheDaCotacao());

describe("cotação do dólar (PTAX)", () => {
  it("pega a última cotação do período", () => {
    expect(ultimaCotacao(RESPOSTA)).toEqual({ reais: 5.014, dia: "2026-10-20" });
    expect(ultimaCotacao({ value: [] })).toBeNull();
    expect(ultimaCotacao(null)).toBeNull();
  });

  it("pede os 7 dias até hoje, no formato do Banco Central", () => {
    const url = enderecoDaPtax(new Date("2026-10-21T15:00:00Z"));
    expect(url).toContain("@dataInicial='10-14-2026'");
    expect(url).toContain("@dataFinalCotacao='10-21-2026'");
  });

  it("falha do Banco Central vira null, nunca uma cotação inventada", async () => {
    const quebrado = (() => Promise.reject(new Error("rede"))) as unknown as typeof fetch;
    expect(await lerCotacaoDoDolar(new Date(), quebrado)).toBeNull();
  });

  it("guarda a cotação: a segunda leitura não chama o Banco Central", async () => {
    let chamadas = 0;
    const ok = (() => {
      chamadas++;
      return Promise.resolve(new Response(JSON.stringify(RESPOSTA), { status: 200 }));
    }) as unknown as typeof fetch;
    const agora = new Date("2026-10-21T15:00:00Z");
    expect(await lerCotacaoDoDolar(agora, ok)).toEqual({ reais: 5.014, dia: "2026-10-20" });
    await lerCotacaoDoDolar(agora, ok);
    expect(chamadas).toBe(1);
  });
});

describe("descontarIa", () => {
  it("desconta o custo de IA convertido", () => {
    // US$ 12,34 × 5,014 = R$ 61,87
    expect(descontarIa(1000, 1234, { reais: 5.014, dia: "2026-10-20" })).toEqual({ lucro: 938.13, custoIaReais: 61.87, descontaIa: true });
  });

  it("sem consumo ou sem cotação, não desconta", () => {
    expect(descontarIa(1000, null, { reais: 5, dia: "2026-10-20" })).toEqual({ lucro: 1000, custoIaReais: null, descontaIa: false });
    expect(descontarIa(1000, 1234, null)).toEqual({ lucro: 1000, custoIaReais: null, descontaIa: false });
  });
});
