/**
 * O fluxo no comando cala a agente — e só quando ele conduz de verdade (pergunta esperando, sequência em curso).
 */
import { describe, expect, it, vi } from "vitest";

import { fluxoNoComando, sqlFluxoNoComando } from "./fluxo-no-comando";

describe("fluxoNoComando", () => {
  it("⭐ pergunta esperando resposta ou sequência em curso = fluxo no comando", () => {
    const sql = sqlFluxoNoComando("v.organization_id", "v.contact_id");
    expect(sql).toContain("fe.status = 'waiting_reply'");
    expect(sql).toContain("fe.status = 'active' and (fe.next_eval_at is null or fe.next_eval_at < now() + interval '1 day')");
    // Fluxo desligado para de guiar na hora.
    expect(sql).toContain("fep.status = 'active'");
  });

  it("⭐ o nó Agente de IA e o roteiro de atendimento NÃO calam a agente: são conduzidos por ela", () => {
    const sql = sqlFluxoNoComando("v.organization_id", "v.contact_id");
    expect(sql).not.toContain("com_agente");
    expect(sql).not.toContain("coletando");
  });

  it("devolve o que o banco diz, com org e contato como parâmetros", async () => {
    const query = vi.fn(async () => ({ rows: [{ conduzindo: true }] }));
    expect(await fluxoNoComando({ query } as never, "org", "contato")).toBe(true);
    expect((query.mock.calls as unknown as unknown[][])[0]![1]).toEqual(["org", "contato"]);
  });

  it("fail-open: consulta falhou = a agente segue (nunca deixar a pessoa sem ninguém)", async () => {
    const query = vi.fn(async () => {
      throw new Error("banco fora");
    });
    expect(await fluxoNoComando({ query } as never, "org", "contato")).toBe(false);
  });
});
