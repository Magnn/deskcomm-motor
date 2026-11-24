import { describe, expect, it } from "vitest";

import type { FunilDoAnuncio } from "./resultado-por-anuncio";
import { montarResumoDaConta, periodoAnterior, vereditoDaCampanha } from "./resumo-da-conta";

const funil = (anuncio: string, leads: number, compradores: number, receita: number): FunilDoAnuncio => ({
  anuncio,
  titulo: null,
  leads,
  engajaram: 0,
  ouviram_preco: 0,
  receberam_link: 0,
  compradores,
  compras: compradores,
  receita_cents: receita,
});

describe("montarResumoDaConta", () => {
  const campanhas = [
    { id: "c1", nome: "ZAP", veiculacao: "ACTIVE" },
    { id: "c2", nome: "Leitura", veiculacao: "PAUSED" },
    { id: "c3", nome: "Antiga", veiculacao: "PAUSED" },
    { id: "c4", nome: "Nova", veiculacao: "WITH_ISSUES" },
  ];
  const anuncios = [
    { adId: "a1", nome: "Ele esfriou?", campanhaId: "c1", gastoCents: 20000 },
    { adId: "a2", nome: "Carta do mês", campanhaId: "c1", gastoCents: 8000 },
    { adId: "a3", nome: "Leitura", campanhaId: "c2", gastoCents: 5000 },
  ];
  const r = montarResumoDaConta({
    anuncios,
    anunciosAnteriores: [{ adId: "a1", nome: null, campanhaId: "c1", gastoCents: 10000 }],
    // "x" é anúncio de outra conta: não entra nas vendas desta.
    funil: [funil("a1", 30, 4, 52000), funil("a2", 10, 1, 13000), funil("a3", 5, 0, 0), funil("x", 50, 9, 90000)],
    funilAnterior: [funil("a1", 20, 2, 26000)],
    campanhas,
  });

  it("soma gasto e vendas só dos anúncios da conta", () => {
    expect(r.atual).toEqual({ gastoCents: 33000, receitaCents: 65000, compradores: 5, conversas: 45, retorno: 1.97, custoPorClienteCents: 6600 });
    expect(r.anterior.retorno).toBe(2.6);
  });

  it("rodando = ativa ou com gasto, por gasto; o resto conta como parada", () => {
    expect(r.rodando.map((c) => [c.nome, c.gastoCents, c.compradores])).toEqual([
      ["ZAP", 28000, 5],
      ["Leitura", 5000, 0],
    ]);
    expect(r.paradas).toBe(2);
  });

  it("campeões por receita, só quem vendeu", () => {
    expect(r.campeoes.map((c) => c.nome)).toEqual(["Ele esfriou?", "Carta do mês"]);
  });

  it("funil de cada anúncio que gastou, do que mais gastou ao que menos", () => {
    expect(r.anuncios.length).toBeGreaterThan(0);
    expect(r.anuncios.every((a) => a.gastoCents > 0)).toBe(true);
    expect([...r.anuncios].sort((x, y) => y.gastoCents - x.gastoCents)).toEqual(r.anuncios);
    const vendeu = r.anuncios.find((a) => a.compradores > 0);
    expect(vendeu?.retorno).toBe(Number(((vendeu?.receitaCents ?? 0) / (vendeu?.gastoCents ?? 1)).toFixed(2)));
  });

  it("alerta para campanha com problema na veiculação", () => {
    expect(r.alertas).toEqual([{ campanha: "Nova", veiculacao: "WITH_ISSUES" }]);
  });
});

describe("vereditoDaCampanha", () => {
  it("decide pelo retorno, espera dado e não julga outra moeda", () => {
    expect(vereditoDaCampanha({ gastoCents: 10000, compradores: 3, retorno: 2.4 }, "BRL")).toBe("escalar");
    expect(vereditoDaCampanha({ gastoCents: 10000, compradores: 1, retorno: 1.3 }, "BRL")).toBe("segurar");
    expect(vereditoDaCampanha({ gastoCents: 10000, compradores: 0, retorno: 0 }, "BRL")).toBe("cortar");
    expect(vereditoDaCampanha({ gastoCents: 3000, compradores: 0, retorno: 0 }, "BRL")).toBe("pouco_dado");
    expect(vereditoDaCampanha({ gastoCents: 10000, compradores: 3, retorno: 2.4 }, "USD")).toBeNull();
  });
});

describe("periodoAnterior", () => {
  it("mesmo tamanho, terminando na véspera, atravessando o mês", () => {
    expect(periodoAnterior("2026-11-16", "2026-11-22")).toEqual({ de: "2026-11-09", ate: "2026-11-15" });
    expect(periodoAnterior("2026-11-01", "2026-11-01")).toEqual({ de: "2026-10-31", ate: "2026-10-31" });
  });
});
