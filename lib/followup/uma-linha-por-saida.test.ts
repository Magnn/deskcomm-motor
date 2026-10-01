import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";
import { linhasDaMesmaSaida, saidaDaLinha, saidasComMaisDeUmaLinha } from "./uma-linha-por-saida";
import { validateFlowForPublish } from "./validate-publish";

const pos = { x: 0, y: 0 };
const gatilho: FlowNode = { id: "t", type: "trigger", label: "Início", position: pos, config: {} };
const texto = (id: string, label: string): FlowNode => ({
  id,
  type: "action",
  label,
  position: pos,
  config: { mode: "content", items: [{ type: "text", body: "oi" }] },
});
const decisao: FlowNode = {
  id: "c",
  type: "condition",
  label: "Tem etiqueta?",
  position: pos,
  config: { combinator: "and", checks: [{ field: "tag", op: "eq", value: "vip" }] },
};
let n = 0;
const linha = (source: string, target: string, condition: FlowEdge["condition"] = { type: "always" }): FlowEdge => ({
  id: `e${++n}`,
  source,
  target,
  priority: 0,
  condition,
});
const sim: FlowEdge["condition"] = { type: "cond_result", value: true };
const nao: FlowEdge["condition"] = { type: "cond_result", value: false };
const grafo = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({ nodes, edges });

describe("uma saída, uma linha", () => {
  it("duas linhas da mesma saída de uma caixa simples: conflito", () => {
    const g = grafo([gatilho, texto("a", "A"), texto("b", "B")], [linha("t", "a"), linha("t", "b")]);
    const conflitos = saidasComMaisDeUmaLinha(g);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatchObject({ node_id: "t" });
    expect(conflitos[0]!.edge_ids).toHaveLength(2);
  });

  it("a MESMA linha desenhada duas vezes (mesma saída, mesmo destino) também é conflito", () => {
    const g = grafo([gatilho, texto("a", "A")], [linha("t", "a"), linha("t", "a")]);
    expect(saidasComMaisDeUmaLinha(g)).toHaveLength(1);
  });

  it("saídas DIFERENTES da mesma caixa (Sim e Não) não conflitam", () => {
    const g = grafo(
      [gatilho, decisao, texto("a", "A"), texto("b", "B")],
      [linha("t", "c"), linha("c", "a", sim), linha("c", "b", nao)],
    );
    expect(saidasComMaisDeUmaLinha(g)).toEqual([]);
  });

  it("várias linhas ENTRANDO na mesma caixa são caminhos que se juntam: não é conflito", () => {
    const g = grafo(
      [gatilho, decisao, texto("a", "A")],
      [linha("t", "c"), linha("c", "a", sim), linha("c", "a", nao)],
    );
    expect(saidasComMaisDeUmaLinha(g)).toEqual([]);
    expect(validateFlowForPublish(g)).toEqual({ ok: true });
  });

  it("o dialeto antigo e o novo da MESMA saída contam como a mesma saída", () => {
    expect(saidaDaLinha(decisao, sim)).toBe(saidaDaLinha(decisao, { type: "branch", branch_id: saidaDaLinha(decisao, sim) }));
  });

  it("linhasDaMesmaSaida devolve só quem ocupa a saída da linha nova — nunca ela mesma, nem outra saída", () => {
    const antiga = linha("c", "a", sim);
    const outra = linha("c", "b", nao);
    const nova = linha("c", "b", sim);
    expect(linhasDaMesmaSaida([antiga, outra, nova], decisao, nova)).toEqual([antiga]);
  });

  it("publicar recusa, com o nome da caixa e da saída", () => {
    const g = grafo(
      [gatilho, decisao, texto("a", "A"), texto("b", "B")],
      [linha("t", "c"), linha("c", "a", sim), linha("c", "b", sim)],
    );
    const r = validateFlowForPublish(g);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const erro = r.errors.find((e) => e.code === "saida_com_mais_de_uma_linha");
      expect(erro?.node_id).toBe("c");
      expect(erro?.message).toContain('"Tem etiqueta?"');
      expect(erro?.message).toContain("2 linhas");
      expect(erro?.message).toContain('pela saída "');
    }
  });

  it("caixa de saída única: a mensagem não inventa nome de saída", () => {
    const g = grafo([gatilho, texto("a", "A"), texto("b", "B")], [linha("t", "a"), linha("t", "b")]);
    const r = validateFlowForPublish(g);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const erro = r.errors.find((e) => e.code === "saida_com_mais_de_uma_linha");
      expect(erro?.message).toBe(
        'A caixa "Início" tem 2 linhas saindo, e o fluxo só segue uma. Apague as que sobram e deixe uma linha só.',
      );
    }
  });
});
