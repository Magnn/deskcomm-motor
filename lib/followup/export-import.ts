import { z } from "zod";

/**
 * Esquema de intercâmbio de fluxos: o arquivo que o botão "Exportar" do
 * construtor gera e que "Importar" lê. NÃO há conversor de outros produtos — o
 * arquivo precisa ter sido exportado por este sistema.
 */
export const flowTemplatePackageSchema = z.object({
  schemaVersion: z.literal("1.0").default("1.0"),
  name: z.string().min(1, "Nome do modelo é obrigatório"),
  description: z.string().default(""),
  category: z.string().default("Geral"),
  tags: z.array(z.string()).default([]),
  nodes: z.array(z.record(z.string(), z.unknown())),
  edges: z.array(z.record(z.string(), z.unknown())),
  triggers: z.array(
    z.object({
      type: z.string(),
      config: z.record(z.string(), z.unknown()).default({}),
    })
  ).default([]),
  exportedAt: z.string().default(() => new Date().toISOString()),
});

export type FlowTemplatePackage = z.infer<typeof flowTemplatePackageSchema>;

/**
 * Exporta um fluxo atual para um payload JSON pronto para download.
 */
export function exportFlowToTemplate(params: {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  triggers?: FlowTemplatePackage["triggers"];
}): FlowTemplatePackage {
  return flowTemplatePackageSchema.parse({
    schemaVersion: "1.0",
    name: params.name,
    description: params.description || "",
    category: params.category || "Geral",
    tags: params.tags || [],
    nodes: params.nodes,
    edges: params.edges,
    triggers: params.triggers || [],
    exportedAt: new Date().toISOString(),
  });
}

/**
 * Importa e higieniza um modelo de fluxo:
 * - Valida a estrutura JSON
 * - Regera IDs dos nós para novos UUIDs evitando colisões
 * - Remapeia as conexões (edges) para os novos IDs
 */
export function importFlowTemplate(
  jsonContent: string | Record<string, unknown>,
  idGenerator: () => string = () => `node_${Math.random().toString(36).substring(2, 9)}`
): {
  name: string;
  description: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  triggers: FlowTemplatePackage["triggers"];
} {
  const parsed = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
  const validated = flowTemplatePackageSchema.parse(parsed);

  const idMap = new Map<string, string>();

  // Atribui novo ID para cada nó
  const remappedNodes = validated.nodes.map((node) => {
    const rawId = String(node.id || "");
    const newId = idGenerator();
    if (rawId) {
      idMap.set(rawId, newId);
    }
    return {
      ...node,
      id: newId,
    };
  });

  // Remapeia as arestas para os novos IDs
  const remappedEdges = validated.edges
    .map((edge) => {
      const rawSource = String(edge.source || "");
      const rawTarget = String(edge.target || "");
      const newSource = idMap.get(rawSource);
      const newTarget = idMap.get(rawTarget);
      if (!newSource || !newTarget) return null;

      return {
        ...edge,
        id: `edge_${newSource}_${newTarget}_${Math.random().toString(36).substring(2, 6)}`,
        source: newSource,
        target: newTarget,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  return {
    name: validated.name,
    description: validated.description,
    nodes: remappedNodes,
    edges: remappedEdges,
    triggers: validated.triggers,
  };
}
