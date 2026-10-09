/**
 * O USO DE IA É A CONTA INTEIRA.
 *
 * Três defeitos medidos em produção em 09/10/2026, na mesma tela:
 *   1. ela lia as chamadas linha por linha e a REST cortava em 1.000 — 1.000 de 177.579;
 *   2. o modelo que fazia o atendimento (`deepseek-flash`) não tinha preço: 152 mil chamadas e
 *      3,5 bilhões de tokens com custo nulo;
 *   3. a leitura de clima arredondava cada chamada para um centavo: US$ 222 na tela por um
 *      serviço que custou cerca de US$ 5.
 */
import { describe, expect, it } from "vitest";

import { costCents, ehPicoDaDeepseek } from "@/lib/agent-engine/edge/llm/pricing";
import { computeCost } from "@/lib/ai/cost";
import { montarUso, type LinhaDeUso } from "@/lib/ai/usage/aggregate";

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

describe("montarUso — arruma o que o banco somou", () => {
  const range = { from: new Date("2026-10-08T00:00:00Z"), to: new Date("2026-10-09T00:00:00Z") };
  const linhas = [
    linha({
      nivel: 3,
      chamadas: 177_579,
      tokens_de_entrada: 3_531_659_761,
      tokens_de_saida: 60_718_033,
      tokens_reaproveitados: 3_094_676_569,
      custo_cents: 14_000.5,
      chamadas_sem_preco: 5,
      p50_ms: 1300,
      p95_ms: 7300,
    }),
    linha({ nivel: 1, dia: "2026-10-08", chamadas: 100_000, tokens_de_entrada: 2_000_000_000, tokens_de_saida: 30_000_000, custo_cents: 8000, p50_ms: 1200, p95_ms: 7000 }),
    linha({ nivel: 1, dia: "2026-10-09", chamadas: 77_579, tokens_de_entrada: 1_531_659_761, tokens_de_saida: 30_718_033, custo_cents: 6000.5, p50_ms: 1400, p95_ms: 7600 }),
    linha({ nivel: 0, dia: "2026-10-08", finalidade: "checkpoint", chamadas: 10, tokens_de_entrada: 500, tokens_de_saida: 50, custo_cents: 1 }),
    linha({ nivel: 0, dia: "2026-10-08", finalidade: "agent_turn", chamadas: 20, tokens_de_entrada: 9000, tokens_de_saida: 100, tokens_reaproveitados: 8000, custo_cents: 3 }),
    linha({ nivel: 0, dia: "2026-10-09", finalidade: "agent_turn", chamadas: 5, tokens_de_entrada: 1000, tokens_de_saida: 10, custo_cents: 0.5 }),
  ];
  const uso = montarUso(
    linhas,
    [
      { dia: "2026-10-08", recebidas: 200, passagens: 2 },
      { dia: "2026-10-09", recebidas: 300, passagens: 0 },
    ],
    range,
  );

  it("⭐ o total é o do banco — não a soma de um recorte de linhas", () => {
    expect(uso.totals.invocations).toBe(177_579);
    expect(uso.totals.input_tokens).toBe(3_531_659_761);
    expect(uso.totals.output_tokens).toBe(60_718_033);
    expect(uso.totals.total_tokens).toBe(3_531_659_761 + 60_718_033);
    expect(uso.totals.cached_tokens).toBe(3_094_676_569);
    expect(uso.totals.cost_cents).toBe(14_000.5);
    expect(uso.totals.unpriced_invocations).toBe(5);
  });

  it("o tempo de resposta do período é o percentil do período, não a média dos dias", () => {
    expect(uso.totals.p50_latency_ms).toBe(1300);
    expect(uso.totals.p95_latency_ms).toBe(7300);
    expect(uso.series.p95_latency_ms).toEqual([
      { day: "2026-10-08", value: 7000 },
      { day: "2026-10-09", value: 7600 },
    ]);
  });

  it("as séries têm todos os dias do período, na ordem", () => {
    expect(uso.series.total_tokens).toEqual([
      { day: "2026-10-08", value: 2_030_000_000 },
      { day: "2026-10-09", value: 1_531_659_761 + 30_718_033 },
    ]);
    expect(uso.series.cost_cents.map((p) => p.value)).toEqual([8000, 6000.5]);
  });

  it("a passagem para uma pessoa é passagens ÷ mensagens recebidas", () => {
    expect(uso.series.handoff_rate).toEqual([
      { day: "2026-10-08", value: 0.01 },
      { day: "2026-10-09", value: 0 },
    ]);
    expect(uso.totals.handoff_rate).toBe(0.004);
  });

  it("para onde foram os tokens: por finalidade, somando os dias, a maior primeiro", () => {
    expect(uso.kinds).toEqual([
      { kind: "agent_turn", invocations: 25, input_tokens: 10_000, output_tokens: 110, cached_tokens: 8000, cost_cents: 3.5 },
      { kind: "checkpoint", invocations: 10, input_tokens: 500, output_tokens: 50, cached_tokens: 0, cost_cents: 1 },
    ]);
    expect(uso.by_kind).toEqual({ agent_turn: 25, checkpoint: 10 });
  });

  it("período sem chamada nenhuma: tudo zero, e os dias continuam lá", () => {
    const vazio = montarUso([], [], range);
    expect(vazio.totals.invocations).toBe(0);
    expect(vazio.totals.total_tokens).toBe(0);
    expect(vazio.series.cost_cents).toHaveLength(2);
    expect(vazio.kinds).toEqual([]);
  });

  it("número que o banco manda como texto vira número", () => {
    const comTexto = montarUso(
      [linha({ nivel: 3, custo_cents: "12.5" as unknown as number, chamadas: "3" as unknown as number })],
      [],
      range,
    );
    expect(comTexto.totals.cost_cents).toBe(12.5);
    expect(comTexto.totals.invocations).toBe(3);
  });
});

describe("o preço da DeepSeek", () => {
  const FORA_DO_PICO = new Date("2026-10-08T15:00:00Z"); // quinta, 15h UTC
  const NO_PICO = new Date("2026-10-08T07:00:00Z"); // quinta, 07h UTC
  const uso = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };

  it("⭐ deepseek-flash TEM preço — não volta custo nulo", () => {
    // US$ 0,15 de entrada + US$ 0,60 de saída por milhão, fora do pico.
    expect(costCents("deepseek-flash", uso, "1h", FORA_DO_PICO)).toBeCloseTo(75, 6);
    expect(costCents("deepseek-v4-pro", uso, "1h", FORA_DO_PICO)).toBeCloseTo(264, 6);
  });

  it("o trecho repetido da conversa custa 2% da entrada", () => {
    const quaseTudoRepetido = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 900_000, cacheWriteTokens: 0 };
    // 100 mil a US$ 0,15/M + 900 mil a US$ 0,003/M = 1,5¢ + 0,27¢
    expect(costCents("deepseek-flash", quaseTudoRepetido, "1h", FORA_DO_PICO)).toBeCloseTo(1.77, 6);
  });

  it("no horário de pico o preço dobra", () => {
    expect(costCents("deepseek-flash", uso, "1h", NO_PICO)).toBeCloseTo(150, 6);
  });

  it("o pico é 01–04 e 06–10 UTC, de segunda a sexta", () => {
    const utc = (iso: string) => ehPicoDaDeepseek(new Date(iso));
    expect(utc("2026-10-08T01:00:00Z")).toBe(true);
    expect(utc("2026-10-08T03:59:00Z")).toBe(true);
    expect(utc("2026-10-08T04:00:00Z")).toBe(false);
    expect(utc("2026-10-08T05:30:00Z")).toBe(false);
    expect(utc("2026-10-08T06:00:00Z")).toBe(true);
    expect(utc("2026-10-08T09:59:00Z")).toBe(true);
    expect(utc("2026-10-08T10:00:00Z")).toBe(false);
    expect(utc("2026-10-10T07:00:00Z")).toBe(false); // sábado
    expect(utc("2026-10-11T02:00:00Z")).toBe(false); // domingo
  });

  it("modelo de preço único não muda com a hora", () => {
    expect(costCents("claude-sonnet-5", uso, "1h", NO_PICO)).toBe(costCents("claude-sonnet-5", uso, "1h", FORA_DO_PICO));
  });
});

describe("computeCost — o custo dos workers é fracionário", () => {
  it("⭐ uma leitura de clima de 278 tokens NÃO custa um centavo", async () => {
    // Com o arredondamento para cima, cada chamada destas virava 1¢: 25.736 delas, US$ 222.
    const custo = await computeCost({ model: "deepseek/deepseek-flash", promptTokens: 278, completionTokens: 278 });
    expect(custo).toBeGreaterThan(0);
    expect(custo).toBeLessThan(0.05);
  });

  it("o id com prefixo do provedor acha o MESMO preço do motor", async () => {
    const doWorker = await computeCost({ model: "deepseek/deepseek-flash", promptTokens: 1_000_000, completionTokens: 0 });
    // Fora do pico são 15¢ por milhão de entrada; no pico, 30¢. A hora é a do relógio.
    expect([15, 30]).toContain(Math.round(doWorker * 1e6) / 1e6);
  });
});
