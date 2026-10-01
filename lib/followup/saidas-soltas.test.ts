import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";
import { saidasSoltasDoGrafo } from "./saidas-soltas";

const no = (id: string, type: FlowNode["type"], config: Record<string, unknown>): FlowNode =>
  ({ id, type, label: id, position: { x: 0, y: 0 }, config }) as FlowNode;
const edge = (source: string, target: string, condition: FlowEdge["condition"]): FlowEdge => ({
  id: `${source}->${target}:${JSON.stringify(condition)}`,
  source,
  target,
  priority: 0,
  condition,
});
const grafo = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({ nodes, edges }) as FlowGraph;

describe("saidasSoltasDoGrafo — o que MUDA para os fluxos já publicados", () => {
  const menu = no("m", "menu", { prompt: "?", options: [{ id: "o1", label: "Comprar" }, { id: "o2", label: "Suporte" }], grace_timeout_ms: 900_000 });
  const fim = no("f", "end", { outcome: "exhausted" });

  it("grafo totalmente ligado não acusa nada", () => {
    const g = grafo(
      [no("t", "trigger", {}), menu, fim],
      [
        edge("t", "m", { type: "always" }),
        edge("m", "f", { type: "branch", branch_id: "o1" }),
        edge("m", "f", { type: "branch", branch_id: "o2" }),
        edge("m", "f", { type: "branch", branch_id: "no_reply" }),
      ],
    );
    expect(saidasSoltasDoGrafo(g)).toEqual([]);
  });

  it("saída solta COM «Outros casos» ligado: o motor antigo escapava para lá (comportamento que muda)", () => {
    const g = grafo(
      [no("t", "trigger", {}), menu, fim, no("outros", "action", { mode: "text", body: "x" })],
      [
        edge("t", "m", { type: "always" }),
        edge("m", "f", { type: "branch", branch_id: "o1" }),
        edge("m", "outros", { type: "always" }),
      ],
    );
    const soltas = saidasSoltasDoGrafo(g);
    const suporte = soltas.find((s) => s.saida === "Suporte");
    expect(suporte).toMatchObject({ antes: "escape", iaPara: "outros", nodeId: "m" });
    expect(soltas.find((s) => s.saida === "Sem resposta")).toMatchObject({ antes: "escape", iaPara: "outros" });
  });

  it("saída solta SEM escape: o motor antigo falhava", () => {
    const g = grafo([no("t", "trigger", {}), menu], [edge("t", "m", { type: "always" })]);
    const soltas = saidasSoltasDoGrafo(g);
    expect(soltas.length).toBeGreaterThan(0);
    expect(soltas.every((s) => s.antes === "erro" && s.iaPara === null)).toBe(true);
  });

  it("nó de saída única sem aresta também aparece; o Fim nunca", () => {
    const g = grafo([no("t", "trigger", {}), no("a", "action", { mode: "text", body: "oi" }), fim], [edge("t", "a", { type: "always" })]);
    const soltas = saidasSoltasDoGrafo(g);
    expect(soltas.map((s) => s.nodeId)).toEqual(["a"]);
  });
});
