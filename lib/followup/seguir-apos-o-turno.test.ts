import { describe, expect, it, vi } from "vitest";

import type { EnrollmentRow } from "./node-handlers";
import { MAX_PASSOS_ENCADEADOS, seguirAposOTurno } from "./seguir-apos-o-turno";
import type { TurnBridgeAdminClient } from "./turn-bridge";

/**
 * O ritmo do fluxo é o delay que o dono configurou. Entre o fim de uma caixa e o
 * começo da seguinte não entra a espera do relógio de um minuto — mas uma espera
 * CONFIGURADA continua sendo respeitada.
 */

const AGORA = new Date("2026-10-02T00:05:37.000Z");
const clock = () => AGORA;
const antes = "2026-10-02T00:05:37.000Z";
const depois = "2026-10-02T00:15:37.000Z";

const inscricao = (over: Partial<EnrollmentRow>): EnrollmentRow =>
  ({
    id: "insc-1",
    organization_id: "org-1",
    status: "active",
    current_node_id: "caixa-2",
    steps_taken: 2,
    next_eval_at: antes,
    ...over,
  }) as EnrollmentRow;

/** `estados` é o que o banco devolve a cada leitura, em ordem. */
function cenario(estados: Array<EnrollmentRow | null>) {
  const fila = [...estados];
  const loadEnrollmentById = vi.fn(async () => (fila.length > 1 ? fila.shift()! : (fila[0] ?? null)));
  const avancar = vi.fn(async (..._a: unknown[]) => {});
  const enqueueJob = vi.fn(async () => {});
  const warn = vi.fn();
  const db = { loadEnrollmentById } as unknown as TurnBridgeAdminClient;
  const rodar = (nodeConcluido = "caixa-1") =>
    seguirAposOTurno({ db, enqueueJob, clock, avancar, log: { warn } }, "org-1", "insc-1", nodeConcluido);
  return { rodar, avancar, warn, loadEnrollmentById };
}

describe("depois do turno, a próxima caixa começa na hora", () => {
  it("a inscrição avançou e já venceu: dá o passo agora, com a inscrição que o banco tem", async () => {
    const c = cenario([inscricao({}), inscricao({})]);
    expect(await c.rodar()).toBe(1);
    expect(c.avancar).toHaveBeenCalledTimes(1);
    expect(c.avancar.mock.calls[0]![1]).toMatchObject({ id: "insc-1", current_node_id: "caixa-2" });
  });

  it("espera CONFIGURADA (próxima avaliação no futuro) é respeitada — fica para o relógio", async () => {
    const c = cenario([inscricao({ next_eval_at: depois })]);
    expect(await c.rodar()).toBe(0);
    expect(c.avancar).not.toHaveBeenCalled();
  });

  it("inscrição estacionada (sem data) não é empurrada", async () => {
    const c = cenario([inscricao({ next_eval_at: null })]);
    expect(await c.rodar()).toBe(0);
    expect(c.avancar).not.toHaveBeenCalled();
  });

  it("o turno não avançou (adiado/vetado: a inscrição segue na mesma caixa): nada a seguir", async () => {
    const c = cenario([inscricao({ current_node_id: "caixa-1" })]);
    expect(await c.rodar("caixa-1")).toBe(0);
    expect(c.avancar).not.toHaveBeenCalled();
  });

  it.each(["waiting_reply", "paused_handoff", "paused_manual", "cancelled", "completed"] as const)(
    "inscrição em '%s' não é tocada",
    async (status) => {
      const c = cenario([inscricao({ status: status as EnrollmentRow["status"] })]);
      expect(await c.rodar()).toBe(0);
      expect(c.avancar).not.toHaveBeenCalled();
    },
  );

  it("atravessa caixas que só decidem (condição, desvio) e para quando chega numa espera", async () => {
    const c = cenario([
      inscricao({ current_node_id: "condicao", steps_taken: 2 }),
      inscricao({ current_node_id: "divisao", steps_taken: 3 }),
      inscricao({ current_node_id: "delay", steps_taken: 4, next_eval_at: depois }),
    ]);
    expect(await c.rodar()).toBe(2);
    expect(c.avancar).toHaveBeenCalledTimes(2);
  });

  it("deu o passo e ficou no mesmo lugar (a caixa enfileirou o próprio turno): para — não enfileira duas vezes", async () => {
    const c = cenario([inscricao({}), inscricao({})]);
    await c.rodar();
    expect(c.avancar).toHaveBeenCalledTimes(1);
  });

  it("tem teto: um grafo em laço não prende o worker", async () => {
    let n = 0;
    const loadEnrollmentById = vi.fn(async () => inscricao({ current_node_id: `caixa-${++n + 1}`, steps_taken: n }));
    const avancar = vi.fn(async () => {});
    const db = { loadEnrollmentById } as unknown as TurnBridgeAdminClient;
    const passos = await seguirAposOTurno({ db, enqueueJob: vi.fn(async () => {}), clock, avancar }, "org-1", "insc-1", "caixa-1");
    expect(passos).toBe(MAX_PASSOS_ENCADEADOS);
  });

  it("falha no passo NÃO derruba o turno que acabou de fechar: vira aviso, e o relógio assume", async () => {
    const c = cenario([inscricao({})]);
    c.avancar.mockRejectedValueOnce(new Error("followup_stale"));
    await expect(c.rodar()).resolves.toBe(0);
    expect(c.warn).toHaveBeenCalledWith(expect.stringContaining("o relógio de um minuto assume"), expect.objectContaining({ error: "followup_stale" }));
  });

  it("inscrição que sumiu: nada a fazer", async () => {
    const c = cenario([null]);
    expect(await c.rodar()).toBe(0);
  });
});
