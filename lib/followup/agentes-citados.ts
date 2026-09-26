import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENT_NODE_UNSET_ID, type FlowNode } from "./graph-schema";

/**
 * Os agentes que os nós "Agente de IA" de um grafo citam, lidos do banco.
 *
 * O nó guarda só o `agent_id`; se ele existe NESTA organização, se não foi arquivado, se é um agente que
 * conduz conversa e se já tem versão publicada é coisa que só o banco sabe. Sem esta leitura o publish
 * aprovaria um fluxo cujo agente morreria em toda mensagem — e a mesma organização é filtrada aqui, na
 * consulta, porque o `agent_id` vem do grafo (do cliente) e nunca é confiável sozinho.
 *
 * Mesmo desenho de `etapas-citadas.ts`: quem chama injeta o resultado em `ContextoDoPublish`, e o validador
 * continua uma função pura.
 */
export interface AgenteCitado {
  nome: string;
  arquivado: boolean;
  /** `ai_agents.kind`: só `mcp_agent` conduz uma conversa dentro de um fluxo (o `rag_bot` legado não tem versões). */
  tipo: string;
  /** Tem versão publicada — sem ela o agente não responde a ninguém. */
  publicado: boolean;
}

/** Os `agent_id` citados, sem repetição. O id de "ainda não escolhido" não é consultável e fica de fora. */
export function idsDeAgenteCitados(nodes: readonly FlowNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.type === "agent" && node.config.agent_id !== AGENT_NODE_UNSET_ID) ids.add(node.config.agent_id);
  }
  return [...ids];
}

type Linha = {
  id: string;
  name: string;
  kind: string;
  archived_at: string | null;
  published_version_id: string | null;
};

export async function carregaAgentesCitados(
  client: SupabaseClient,
  orgId: string,
  nodes: readonly FlowNode[],
): Promise<{ ok: true; agentes: Map<string, AgenteCitado> } | { ok: false; mensagem: string }> {
  const agentes = new Map<string, AgenteCitado>();
  const ids = idsDeAgenteCitados(nodes);
  if (ids.length === 0) return { ok: true, agentes };

  const { data, error } = await client
    .from("ai_agents")
    .select("id, name, kind, archived_at, published_version_id")
    .eq("organization_id", orgId)
    .in("id", ids);
  // Erro NÃO vira mapa vazio: vazio leria como "nenhum desses agentes existe" e o publish recusaria um fluxo
  // certo dizendo que o agente foi apagado.
  if (error) return { ok: false, mensagem: error.message };

  for (const linha of (data ?? []) as Linha[]) {
    agentes.set(linha.id, {
      nome: linha.name,
      arquivado: linha.archived_at !== null,
      tipo: linha.kind,
      publicado: linha.published_version_id !== null,
    });
  }
  return { ok: true, agentes };
}
