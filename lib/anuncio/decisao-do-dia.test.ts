import { describe, expect, it } from "vitest";

import { decisaoDoDia, subidaDe } from "./decisao-do-dia";
import { somarCapacidade } from "./capacidade-de-hoje";
import type { CampanhaRodando } from "./resumo-da-conta";

const campanha = (p: Partial<CampanhaRodando>): CampanhaRodando => ({
  id: "c1",
  nome: "Principal",
  veiculacao: "ACTIVE",
  orcamentoDiarioCents: 12600,
  gastoCents: 24800,
  receitaCents: 99700,
  compradores: 10,
  conversas: 120,
  retorno: 4.02,
  custoPorClienteCents: 2480,
  ...p,
});

const agora = new Date("2026-11-24T12:00:00Z");

describe("decisão do dia", () => {
  it("⭐ retorno 4× com 10 vendas: subir 20%, arredondado para baixo ao real", () => {
    const d = decisaoDoDia({ rodando: [campanha({})], mudancas: [], moeda: "BRL", agora });
    expect(d.tipo).toBe("subir");
    expect(d.novoOrcamentoCents).toBe(15100);
    expect(subidaDe(12600)).toBeLessThanOrEqual(Math.round(12600 * 1.2));
  });

  it("decide pela campanha ATIVA que mais gasta", () => {
    const d = decisaoDoDia({
      rodando: [campanha({ id: "pausada", veiculacao: "PAUSED", gastoCents: 90000 }), campanha({ id: "teste", gastoCents: 3000 }), campanha({})],
      mudancas: [],
      moeda: "BRL",
      agora,
    });
    expect(d.campanhaId).toBe("c1");
  });

  it("orçamento mudou há menos de 3 dias: esperar, com a data da leitura", () => {
    const d = decisaoDoDia({
      rodando: [campanha({})],
      mudancas: [{ campanhaId: "c1", quando: "2026-11-23T10:00:00Z", tipo: "orcamento", antesCents: 10500, depoisCents: 12600 }],
      moeda: "BRL",
      agora,
    });
    expect(d.tipo).toBe("esperar");
    expect(d.lerEm).toBe("2026-11-26T10:00:00.000Z");
  });

  it("pausa de outra campanha não segura a subida desta", () => {
    const d = decisaoDoDia({
      rodando: [campanha({})],
      mudancas: [{ campanhaId: "c1", quando: "2026-11-24T10:00:00Z", tipo: "veiculacao", status: "ACTIVE" }],
      moeda: "BRL",
      agora,
    });
    expect(d.tipo).toBe("subir");
  });

  it("venda não paga o anúncio: pausar", () => {
    const d = decisaoDoDia({ rodando: [campanha({ receitaCents: 0, compradores: 0, retorno: 0, gastoCents: 6000 })], mudancas: [], moeda: "BRL", agora });
    expect(d.tipo).toBe("pausar");
  });

  it("retorno 2× ou poucas vendas: manter", () => {
    expect(decisaoDoDia({ rodando: [campanha({ retorno: 2.1 })], mudancas: [], moeda: "BRL", agora }).tipo).toBe("manter");
    expect(decisaoDoDia({ rodando: [campanha({ compradores: 2 })], mudancas: [], moeda: "BRL", agora }).tipo).toBe("manter");
  });

  it("orçamento nos conjuntos: subir sem valor (o painel manda ao Gerenciador)", () => {
    const d = decisaoDoDia({ rodando: [campanha({ orcamentoDiarioCents: null })], mudancas: [], moeda: "BRL", agora });
    expect(d).toMatchObject({ tipo: "subir", novoOrcamentoCents: null });
  });

  it("conta em outra moeda não ganha ação", () => {
    expect(decisaoDoDia({ rodando: [campanha({})], mudancas: [], moeda: "USD", agora }).tipo).toBe("manter");
  });

  it("nenhuma ativa: sem campanha", () => {
    expect(decisaoDoDia({ rodando: [], mudancas: [], moeda: "BRL", agora }).tipo).toBe("sem_campanha");
  });
});

describe("capacidade de hoje", () => {
  it("soma carga e teto; número sem teto não enche", () => {
    expect(
      somarCapacidade([
        { leadsHoje: 20, aCaminho: 4, orcamentoHoje: 24 },
        { leadsHoje: 5, aCaminho: 0, orcamentoHoje: 40 },
        { leadsHoje: 9, aCaminho: 0, orcamentoHoje: null },
      ]),
    ).toEqual({ numeros: 3, leadsHoje: 34, leadsComTeto: 25, orcamento: 64, cheios: 1 });
    expect(somarCapacidade([{ leadsHoje: 3, aCaminho: 0, orcamentoHoje: null }]).orcamento).toBeNull();
  });
});
