/**
 * Quais saídas de um grafo NÃO têm aresta — e o que o motor fazia com elas antes da regra
 * «saída solta deixa o lead parado».
 *
 * Existe para o dia da mudança: fluxos JÁ PUBLICADOS podem ter decisões cuja saída ficou solta
 * (o publish só passou a aceitar isso agora, mas o antigo já deixava passar em alguns nós). Para
 * esses, o comportamento muda — o lead que caía no escape («Outros casos») agora para. Esta função
 * diz onde, para o operador conferir antes de confiar.
 */
import { branchIdForCondition, nodeBranches, type FlowGraph, type FlowNode } from "./graph-schema";
import { rotuloDoRamo } from "./rotulo-do-ramo";

export interface SaidaSolta {
  nodeId: string;
  nodeLabel: string;
  nodeType: FlowNode["type"];
  /** O nome da saída como o dono a vê. */
  saida: string;
  /**
   * `escape` — o motor ANTIGO mandava o lead para a aresta «always» do nó (comportamento que MUDA);
   * `erro` — não havia escape: o motor antigo falhava (backoff, depois `dead`).
   */
  antes: "escape" | "erro";
  /** Para onde ia, quando `antes === 'escape'`. */
  iaPara: string | null;
}

/** Nós de saída única que o fim do fluxo não exige. O `end` não tem saída. */
const SEM_SAIDA: ReadonlySet<FlowNode["type"]> = new Set(["end"]);

export function saidasSoltasDoGrafo(graph: FlowGraph): SaidaSolta[] {
  const achadas: SaidaSolta[] = [];
  for (const node of graph.nodes) {
    if (SEM_SAIDA.has(node.type)) continue;
    const saindo = graph.edges.filter((e) => e.source === node.id);
    const escape = saindo.find((e) => e.condition.type === "always") ?? null;
    const ramos = nodeBranches(node);

    // Nó de saída única (só o escape declarado): solta = nenhuma aresta saindo.
    if (ramos.length === 1 && ramos[0]!.kind === "fallback") {
      if (saindo.length === 0) {
        achadas.push({ nodeId: node.id, nodeLabel: node.label, nodeType: node.type, saida: rotuloDoRamo(ramos[0]!), antes: "erro", iaPara: null });
      }
      continue;
    }

    for (const ramo of ramos) {
      if (ramo.kind !== "match") continue;
      const ligada = saindo.some((e) => branchIdForCondition(node, e.condition) === ramo.id);
      if (ligada) continue;
      achadas.push({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        saida: rotuloDoRamo(ramo),
        antes: escape ? "escape" : "erro",
        iaPara: escape ? escape.target : null,
      });
    }
  }
  return achadas;
}
