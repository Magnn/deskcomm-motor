/**
 * Saída sem ligação não é erro — o lead que sai por ela fica parado no nó. O cartão só precisa dizer ao
 * dono QUAIS saídas estão soltas, para a escolha de deixá-las assim ser consciente.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FlowBranch } from "@/lib/followup/graph-schema";
import { NodeCard } from "./NodeCard";
import { NODE_VISUALS } from "./nodeVisuals";

let arestas: Array<{ source: string; sourceHandle: string | null }> = [];
vi.mock("../EtapasDoFluxo", () => ({
  useEtapasDoFluxo: () => ({ etapas: [], carregando: false, falhou: false, nomes: {} }),
}));
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
  useEdges: () => arestas,
  NodeToolbar: () => null,
}));

const ramo = (id: string, label: string): FlowBranch => ({
  id,
  label,
  check: null,
  kind: "match",
  condition: { type: "branch", branch_id: id },
});
const RAMOS = [ramo("br_sim", "Sim"), ramo("br_nao", "Não"), { ...ramo("else", "Outros casos"), kind: "fallback" as const, condition: { type: "always" as const } }];

describe("cartão — saídas sem ligação", () => {
  it("marca só as saídas soltas de um nó com várias saídas", () => {
    arestas = [{ source: "m1", sourceHandle: "br_sim" }];
    render(<NodeCard id="m1" visual={NODE_VISUALS.match_reply} label="Resposta" subtitle="x" branches={RAMOS} />);
    expect(screen.queryByTestId("saida-solta-m1-br_sim")).toBeNull();
    expect(screen.getByTestId("saida-solta-m1-br_nao")).toBeTruthy();
    expect(screen.getByTestId("saida-solta-m1-else")).toBeTruthy();
  });

  it("nó de saída única sem aresta avisa que o lead fica parado", () => {
    arestas = [];
    render(<NodeCard id="a1" visual={NODE_VISUALS.action} label="Mensagem" subtitle="oi" />);
    expect(screen.getByTestId("saida-solta-a1").textContent).toContain("o lead fica parado");
  });

  it("nó de saída única ligado não mostra aviso; o Fim (sem saída) também não", () => {
    arestas = [{ source: "a1", sourceHandle: null }];
    const { unmount } = render(<NodeCard id="a1" visual={NODE_VISUALS.action} label="Mensagem" subtitle="oi" />);
    expect(screen.queryByTestId("saida-solta-a1")).toBeNull();
    unmount();
    arestas = [];
    render(<NodeCard id="f1" visual={NODE_VISUALS.end} label="Fim" subtitle="x" showSource={false} />);
    expect(screen.queryByTestId("saida-solta-f1")).toBeNull();
  });
});
