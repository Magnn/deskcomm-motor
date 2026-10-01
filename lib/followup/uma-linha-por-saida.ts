/**
 * Uma saída, uma linha.
 *
 * ─── Por que existe ────────────────────────────────────────────────────────
 * O motor segue UMA linha por saída (`selectEdgeExata` pega a primeira que casa).
 * Se o dono puxa duas linhas da mesma bolinha, a segunda nunca roda — e nada na
 * tela avisava: o desenho prometia dois caminhos e o lead só andava por um.
 *
 * A regra vale para a SAÍDA, não para o nó: um Menu tem uma saída por opção, e
 * cada uma leva a um lugar. E vale só para quem SAI: várias linhas ENTRANDO na
 * mesma caixa são caminhos que se juntam — cada lead chega por uma só, não há
 * o que decidir.
 *
 * Este módulo é a regra, sem tela: o canvas usa para trocar a linha antiga pela
 * nova, e o publish usa para recusar um fluxo antigo/importado que já a quebra.
 */
import { conditionKey } from "./edge-condition-options";
import { branchIdForCondition, type FlowEdgeCondition, type FlowGraph, type FlowNode } from "./graph-schema";

/**
 * Por qual saída de `origem` esta condição sai. Condição que não nomeia saída
 * nenhuma da caixa (regra apagada com a linha ainda lá) ganha uma chave própria,
 * para não ser confundida com outra órfã diferente.
 */
export function saidaDaLinha(origem: FlowNode | undefined, condition: FlowEdgeCondition): string {
  return branchIdForCondition(origem, condition) ?? `orfa:${conditionKey(condition)}`;
}

interface LinhaMinima {
  id: string;
  source: string;
  condition: FlowEdgeCondition;
}

/** As linhas que já ocupam a saída por onde `nova` quer sair (fora ela mesma). */
export function linhasDaMesmaSaida<L extends LinhaMinima>(
  linhas: readonly L[],
  origem: FlowNode | undefined,
  nova: LinhaMinima,
): L[] {
  const saida = saidaDaLinha(origem, nova.condition);
  return linhas.filter(
    (l) => l.id !== nova.id && l.source === nova.source && saidaDaLinha(origem, l.condition) === saida,
  );
}

export interface SaidaEmConflito {
  node_id: string;
  /** Id da saída (ramo) com mais de uma linha. */
  saida: string;
  edge_ids: string[];
}

/** Toda saída do grafo com mais de uma linha, em ordem estável (nó, saída). */
export function saidasComMaisDeUmaLinha(graph: Pick<FlowGraph, "nodes" | "edges">): SaidaEmConflito[] {
  const porId = new Map(graph.nodes.map((n) => [n.id, n]));
  const grupos = new Map<string, SaidaEmConflito>();
  for (const e of graph.edges) {
    const saida = saidaDaLinha(porId.get(e.source), e.condition);
    const chave = `${e.source}\u0000${saida}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.edge_ids.push(e.id);
    else grupos.set(chave, { node_id: e.source, saida, edge_ids: [e.id] });
  }
  return [...grupos.values()]
    .filter((g) => g.edge_ids.length > 1)
    .sort((a, b) => a.node_id.localeCompare(b.node_id) || a.saida.localeCompare(b.saida));
}
