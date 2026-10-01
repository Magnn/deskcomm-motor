/**
 * Quais caixas do canvas ainda não podem ser SALVAS, e por quê.
 *
 * ─── Por que existe ────────────────────────────────────────────────────────
 * O rascunho é validado pelo `flowGraphSchema` no PATCH. Uma caixa arrastada e
 * ainda não configurada (o Conteúdo nasce com `items: []`, e o schema pede ao
 * menos um) faz o servidor recusar o rascunho INTEIRO com "Campos inválidos." —
 * sem dizer qual caixa, nem o que falta. Como publicar começa por salvar, o
 * dono via o botão "Publicar" não fazer nada de útil e não tinha o que corrigir.
 *
 * Esta função roda o MESMO schema no navegador, antes de chamar o servidor, e
 * devolve o problema ancorado na caixa — a tela pinta a caixa e diz o que falta.
 * Não é uma segunda validação: é a mesma, feita onde dá para apontar o lugar.
 *
 * Devolve códigos, não frases: a frase é da tela, que traduz.
 */
import { flowGraphSchema, type FlowGraph } from "./graph-schema";

export type MotivoDaCaixaIncompleta =
  /** Conteúdo sem nenhum item. */
  | { tipo: "conteudo_vazio" }
  /** Item de mídia (imagem, vídeo, áudio, documento, figurinha) sem arquivo enviado. */
  | { tipo: "item_sem_arquivo"; item: number }
  /** Item de mídia na origem "link" sem o link preenchido. */
  | { tipo: "item_sem_link"; item: number }
  /** Item de texto em branco. */
  | { tipo: "item_sem_texto"; item: number }
  /** Cartão de contato sem nome ou sem telefone. */
  | { tipo: "item_contato_incompleto"; item: number }
  /** Qualquer outro campo obrigatório por preencher. */
  | { tipo: "configuracao_incompleta" };

export interface CaixaIncompleta {
  node_id: string;
  motivo: MotivoDaCaixaIncompleta;
}

export interface RascunhoIncompleto {
  caixas: CaixaIncompleta[];
  /** Problema do fluxo inteiro, sem caixa para ancorar (ex.: menos de duas caixas). */
  doFluxo: boolean;
}

function motivoDoCaminho(caminho: readonly PropertyKey[]): MotivoDaCaixaIncompleta {
  // caminho = ["nodes", i, "config", "items", j?, campo?]
  if (caminho[2] === "config" && caminho[3] === "items") {
    const item = caminho[4];
    if (typeof item !== "number") return { tipo: "conteudo_vazio" };
    const campo = caminho[5];
    if (campo === "storage_path" || campo === "mime") return { tipo: "item_sem_arquivo", item: item + 1 };
    if (campo === "url") return { tipo: "item_sem_link", item: item + 1 };
    if (campo === "body") return { tipo: "item_sem_texto", item: item + 1 };
    if (campo === "name" || campo === "phone_number") return { tipo: "item_contato_incompleto", item: item + 1 };
  }
  return { tipo: "configuracao_incompleta" };
}

export function rascunhoIncompleto(graph: FlowGraph): RascunhoIncompleto {
  const parsed = flowGraphSchema.safeParse(graph);
  if (parsed.success) return { caixas: [], doFluxo: false };

  const caixas: CaixaIncompleta[] = [];
  const vistos = new Set<string>();
  let doFluxo = false;

  for (const issue of parsed.error.issues) {
    const indice = issue.path[1];
    const no = issue.path[0] === "nodes" && typeof indice === "number" ? graph.nodes[indice] : undefined;
    if (no === undefined) {
      doFluxo = true;
      continue;
    }
    const motivo = motivoDoCaminho(issue.path);
    // Um item sem arquivo acusa `storage_path` E `mime`: é um problema só.
    const chave = `${no.id}|${motivo.tipo}|${"item" in motivo ? motivo.item : ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    caixas.push({ node_id: no.id, motivo });
  }
  return { caixas, doFluxo };
}
