/**
 * EXPORTAR e IMPORTAR um fluxo de verdade, ida e volta.
 *
 * A importação chamava `PUT …/draft`, uma rota que nunca existiu: todo arquivo
 * importado criava um fluxo vazio e terminava em erro. Os testes que havia
 * exercitavam nós inventados (`type: "message"`), que o construtor não tem — por
 * isso passavam sem nunca provar que um fluxo REAL sobrevive à viagem.
 *
 * O que se cobra aqui: o grafo que sai do botão Exportar, depois de importado,
 * passa no MESMO schema que o servidor usa para salvar o rascunho, e continua
 * ligado do mesmo jeito.
 */
import { describe, expect, it } from "vitest";

import { midiasNoArquivo } from "@/app/app/ai/followups/_components/ImportFlowDialog";
import { exportFlowToTemplate, importFlowTemplate } from "@/lib/followup/export-import";
import { flowGraphSchema, type FlowGraph } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";

const pos = { x: 0, y: 0 };
const fluxoReal: FlowGraph = {
  nodes: [
    { id: "trigger_1", type: "trigger", label: "Início do fluxo", position: pos, config: { integration: "whatsapp", event: "keyword", keyword: "quero" } },
    {
      id: "action-2",
      type: "action",
      label: "Boas-vindas",
      position: pos,
      config: {
        mode: "content",
        items: [
          { type: "text", body: "Olá {{primeiro_nome}}!" },
          { type: "delay", seconds: 5 },
          { type: "image", storage_path: "org-1/flow-content/flow-1/foto.jpg", mime: "image/jpeg" },
        ],
      },
    },
    {
      id: "match_reply-3",
      type: "match_reply",
      label: "Casar resposta",
      position: pos,
      config: { branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }], grace_timeout_ms: 900_000 },
    },
    { id: "action-4", type: "action", label: "Oferta", position: pos, config: { mode: "content", items: [{ type: "text", body: "Segue a oferta." }] } },
  ],
  edges: [
    { id: "e1", source: "trigger_1", target: "action-2", priority: 0, condition: { type: "always" } },
    { id: "e2", source: "action-2", target: "match_reply-3", priority: 0, condition: { type: "always" } },
    { id: "e3", source: "match_reply-3", target: "action-4", priority: 0, condition: { type: "branch", branch_id: "br_sim" } },
  ],
};

function idaEVolta(): FlowGraph {
  const arquivo = JSON.stringify(exportFlowToTemplate({ name: "Funil", nodes: fluxoReal.nodes, edges: fluxoReal.edges }));
  let n = 0;
  const importado = importFlowTemplate(arquivo, () => `node_${++n}`);
  return flowGraphSchema.parse({ nodes: importado.nodes, edges: importado.edges });
}

describe("exportar → importar um fluxo real", () => {
  it("o que volta passa no schema do rascunho — é o que o PATCH do servidor exige", () => {
    expect(() => idaEVolta()).not.toThrow();
  });

  it("volta com as mesmas caixas, na mesma ordem, com a mesma configuração", () => {
    const volta = idaEVolta();
    expect(volta.nodes.map((n) => [n.type, n.label])).toEqual(fluxoReal.nodes.map((n) => [n.type, n.label]));
    expect(volta.nodes.map((n) => n.config)).toEqual(fluxoReal.nodes.map((n) => n.config));
  });

  it("as ligações acompanham os ids novos — inclusive a saída da regra", () => {
    const volta = idaEVolta();
    const novoId = new Map(fluxoReal.nodes.map((n, i) => [n.id, volta.nodes[i]!.id]));
    expect(volta.edges.map((e) => [e.source, e.target, e.condition])).toEqual(
      fluxoReal.edges.map((e) => [novoId.get(e.source), novoId.get(e.target), e.condition]),
    );
  });

  it("e o fluxo importado PUBLICA como o original", () => {
    expect(validateFlowForPublish(fluxoReal)).toEqual({ ok: true });
    expect(validateFlowForPublish(idaEVolta())).toEqual({ ok: true });
  });
});

describe("mídias do arquivo importado", () => {
  it("conta os itens que referenciam arquivo — eles não viajam no export", () => {
    expect(midiasNoArquivo(fluxoReal.nodes as never)).toBe(1);
  });

  it("fluxo só de texto: nenhum aviso", () => {
    expect(midiasNoArquivo([{ config: { mode: "content", items: [{ type: "text", body: "oi" }] } }])).toBe(0);
    expect(midiasNoArquivo([{ config: {} }, {}])).toBe(0);
  });
});
