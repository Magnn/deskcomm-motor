/**
 * O que a LISTA de fluxos mostra e filtra sobre cada fluxo, tirado do dado real.
 *
 * Os filtros "App Oficial / App Business" e "Gatilhos" liam o localStorage do
 * navegador: mostravam o que o criador do fluxo escolheu naquele computador, e
 * nada em outro. As duas respostas existem no banco:
 *   - gatilho: a origem configurada na caixa "Início" do rascunho;
 *   - canal:   o tipo dos números que têm este fluxo como dono.
 */
import type { TipoDeNumero } from "@/lib/channels/numeros-do-fluxo";

import { ORIGENS_DO_INICIO, type OrigemDoInicio } from "./graph-schema";

/** A origem da caixa "Início" de um rascunho. Caixa vazia (ou rascunho ausente) = WhatsApp, que é o que o motor faz. */
export function origemDoInicioDoRascunho(draftGraph: unknown): OrigemDoInicio {
  const nodes = (draftGraph as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nodes)) return "whatsapp";
  const inicio = nodes.find((n) => (n as { type?: unknown } | null)?.type === "trigger") as
    | { config?: { integration?: unknown } }
    | undefined;
  const origem = inicio?.config?.integration;
  return typeof origem === "string" && (ORIGENS_DO_INICIO as readonly string[]).includes(origem)
    ? (origem as OrigemDoInicio)
    : "whatsapp";
}

export interface ResumoDoFluxoNaLista {
  inicio_origem: OrigemDoInicio;
  /** Tipos dos números vinculados a este fluxo. Vazio: nenhum número vinculado. */
  numeros: TipoDeNumero[];
}

/** Troca o rascunho inteiro (pesado, e que a lista não precisa) pelo resumo. */
export function resumirFluxosDaLista<T extends { id: string; draft_graph?: unknown }>(
  linhas: readonly T[],
  tiposPorFluxo: ReadonlyMap<string, TipoDeNumero[]>,
): Array<Omit<T, "draft_graph"> & ResumoDoFluxoNaLista> {
  return linhas.map((linha) => {
    const { draft_graph, ...resto } = linha;
    return {
      ...resto,
      inicio_origem: origemDoInicioDoRascunho(draft_graph),
      numeros: tiposPorFluxo.get(linha.id) ?? [],
    };
  });
}
