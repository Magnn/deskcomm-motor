import { describe, expect, it } from "vitest";

import { debounceDoRoteiroMs, janelaDaPerguntaAtualMs } from "./agrupamento-do-roteiro";
import type { EstadoDeAtendimento } from "./atendimento";

type No = EstadoDeAtendimento["situacao"]["pendentes"][number];

function no(key: string, agrupar?: number): No {
  return {
    id: `n-${key}`,
    type: "collect",
    label: key,
    position: { x: 0, y: 0 },
    config: { key, label: key, type: "text", required: true, permite_correcao: true, ...(agrupar !== undefined ? { agrupar_respostas_segundos: agrupar } : {}) },
  } as No;
}

function estado(pendentes: No[], feitas: string[]): Pick<EstadoDeAtendimento, "situacao" | "perguntasFeitas"> {
  return {
    situacao: { pendentes, obrigatoriosPendentes: pendentes, esgotadas: [], skills: [], completo: false },
    perguntasFeitas: new Set(feitas),
  };
}

describe("janelaDaPerguntaAtualMs", () => {
  it("usa a janela da pergunta que está no ar, em milissegundos", () => {
    expect(janelaDaPerguntaAtualMs(estado([no("cidade", 20)], ["cidade"]))).toBe(20_000);
  });

  it("0 segundos = sem janela (responde na hora)", () => {
    expect(janelaDaPerguntaAtualMs(estado([no("cidade", 0)], ["cidade"]))).toBe(0);
  });

  it("sem a opção configurada, cai na janela da instalação (null)", () => {
    expect(janelaDaPerguntaAtualMs(estado([no("cidade")], ["cidade"]))).toBeNull();
  });

  it("pergunta AINDA NÃO feita não dita a janela da resposta a outra", () => {
    expect(janelaDaPerguntaAtualMs(estado([no("cidade", 5), no("prazo", 40)], ["cidade"]))).toBe(5_000);
    expect(janelaDaPerguntaAtualMs(estado([no("prazo", 40)], []))).toBeNull();
  });

  it("sem pendentes (roteiro completo), nada a agrupar", () => {
    expect(janelaDaPerguntaAtualMs(estado([], []))).toBeNull();
  });
});

describe("debounceDoRoteiroMs — fail-open", () => {
  it("contato sem roteiro em andamento → null (vale a janela da instalação)", async () => {
    const db = { query: async () => ({ rows: [] }) };
    expect(await debounceDoRoteiroMs(db as never, { organizationId: "o", contactId: "c" })).toBeNull();
  });

  it("consulta que falha → null, nunca lança", async () => {
    const db = {
      query: async () => {
        throw new Error("db fora");
      },
    };
    expect(await debounceDoRoteiroMs(db as never, { organizationId: "o", contactId: "c" })).toBeNull();
  });
});
