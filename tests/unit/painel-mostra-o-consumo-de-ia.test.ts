/**
 * O PAINEL DE VENDAS MOSTRA O CONSUMO DE IA.
 *
 * O número de tokens e de custo existia só em Agente de IA › Uso de IA. No painel ele fica ao lado
 * das vendas do MESMO período, e ganha a conta que interessa a quem vende: custo de IA por venda.
 */
import { describe, expect, it } from "vitest";

import type { LinhaDeUso } from "@/lib/ai/usage/aggregate";
import { consumoDoPeriodo, custoDeIaPorVenda } from "@/lib/resultado/custo-de-ia";

const linha = (parte: Partial<LinhaDeUso>): LinhaDeUso => ({
  nivel: 0,
  dia: null,
  finalidade: null,
  chamadas: 0,
  tokens_de_entrada: 0,
  tokens_de_saida: 0,
  tokens_reaproveitados: 0,
  custo_cents: 0,
  chamadas_sem_preco: 0,
  p50_ms: 0,
  p95_ms: 0,
  ...parte,
});

describe("consumoDoPeriodo", () => {
  it("⭐ usa o total do período (nível 3), não a soma das linhas de dia e de finalidade", () => {
    // As linhas de nível 0 e 1 repetem as mesmas chamadas em outros recortes: somar tudo triplicaria.
    const consumo = consumoDoPeriodo([
      linha({ nivel: 0, dia: "2026-10-09", finalidade: "agent_turn", chamadas: 10, tokens_de_entrada: 900, custo_cents: 4 }),
      linha({ nivel: 1, dia: "2026-10-09", chamadas: 12, tokens_de_entrada: 1000, tokens_de_saida: 50, custo_cents: 5 }),
      linha({ nivel: 3, chamadas: 12, tokens_de_entrada: 1000, tokens_de_saida: 50, custo_cents: 5, chamadas_sem_preco: 2 }),
    ]);
    expect(consumo).toEqual({ custoCents: 5, tokensLidos: 1000, tokensEscritos: 50, chamadas: 12, chamadasSemPreco: 2 });
  });

  it("período sem chamada: zero de verdade", () => {
    expect(consumoDoPeriodo([])).toEqual({ custoCents: 0, tokensLidos: 0, tokensEscritos: 0, chamadas: 0, chamadasSemPreco: 0 });
  });
});

describe("custoDeIaPorVenda", () => {
  const consumo = { custoCents: 1200, tokensLidos: 0, tokensEscritos: 0, chamadas: 0, chamadasSemPreco: 0 };

  it("divide o custo em dólar pelas vendas do período", () => {
    expect(custoDeIaPorVenda(consumo, 12)).toBe(1);
  });

  it("sem venda, ou sem leitura, não há número — e não é zero", () => {
    expect(custoDeIaPorVenda(consumo, 0)).toBeNull();
    expect(custoDeIaPorVenda(null, 12)).toBeNull();
  });
});
