import { describe, expect, it } from "vitest";

import { rascunhoIncompleto } from "./caixas-incompletas";
import type { FlowGraph } from "./graph-schema";

const gatilho = { id: "trigger-1", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} };
const fim = { id: "end-1", type: "end", label: "Fim", position: { x: 600, y: 0 }, config: { outcome: "converted" } };
const conteudo = (id: string, items: unknown[]) => ({
  id,
  type: "action",
  label: "Conteúdo",
  position: { x: 300, y: 0 },
  config: { mode: "content", items },
});
const liga = (source: string, target: string, id: string) => ({ id, source, target, condition: { type: "always" } });

/** O grafo vem do canvas, onde uma caixa pode estar incompleta — por isso o cast. */
const grafo = (nodes: unknown[], edges: unknown[] = []) => ({ nodes, edges }) as unknown as FlowGraph;

describe("rascunhoIncompleto — aponta a caixa que impede salvar", () => {
  it("fluxo completo não acusa nada", () => {
    const g = grafo(
      [gatilho, conteudo("action-1", [{ type: "text", body: "Oi" }]), fim],
      [liga("trigger-1", "action-1", "e1"), liga("action-1", "end-1", "e2")],
    );
    expect(rascunhoIncompleto(g)).toEqual({ caixas: [], doFluxo: false });
  });

  it("Conteúdo recém-arrastado (sem itens) é a caixa acusada — o caso que travava o Publicar", () => {
    const g = grafo([gatilho, conteudo("action-1", []), fim]);
    expect(rascunhoIncompleto(g)).toEqual({
      caixas: [{ node_id: "action-1", motivo: { tipo: "conteudo_vazio" } }],
      doFluxo: false,
    });
  });

  it("mídia sem arquivo vira UM problema por item, não um por campo", () => {
    const g = grafo([
      gatilho,
      conteudo("action-1", [
        { type: "text", body: "Oi" },
        { type: "image", storage_path: "", mime: "" },
      ]),
      fim,
    ]);
    expect(rascunhoIncompleto(g).caixas).toEqual([
      { node_id: "action-1", motivo: { tipo: "item_sem_arquivo", item: 2 } },
    ]);
  });

  it("texto em branco e contato sem telefone dizem qual item", () => {
    const g = grafo([
      gatilho,
      conteudo("action-1", [
        { type: "text", body: "" },
        { type: "contact", name: "Suporte", phone_number: "" },
      ]),
      fim,
    ]);
    expect(rascunhoIncompleto(g).caixas).toEqual([
      { node_id: "action-1", motivo: { tipo: "item_sem_texto", item: 1 } },
      { node_id: "action-1", motivo: { tipo: "item_contato_incompleto", item: 2 } },
    ]);
  });

  it("duas caixas incompletas são as duas acusadas, cada uma com o seu motivo", () => {
    const g = grafo([gatilho, conteudo("action-1", []), conteudo("action-2", [{ type: "text", body: "" }]), fim]);
    expect(rascunhoIncompleto(g).caixas.map((c) => c.node_id)).toEqual(["action-1", "action-2"]);
  });

  it("outro tipo de caixa por preencher cai no motivo genérico, ancorado nela", () => {
    const espera = { id: "wait-1", type: "wait", label: "Delay", position: { x: 0, y: 0 }, config: {} };
    const r = rascunhoIncompleto(grafo([gatilho, espera, fim]));
    expect(r.caixas).toEqual([{ node_id: "wait-1", motivo: { tipo: "configuracao_incompleta" } }]);
  });

  it("problema sem caixa para ancorar (fluxo com uma caixa só) é do fluxo", () => {
    expect(rascunhoIncompleto(grafo([gatilho]))).toEqual({ caixas: [], doFluxo: true });
  });
});

describe("rascunhoIncompleto — mídia por link", () => {
  it("origem 'link' ainda sem link é acusada como falta de LINK, não de arquivo", () => {
    const g = grafo([gatilho, conteudo("action-1", [{ type: "image", url: "" }]), fim]);
    expect(rascunhoIncompleto(g).caixas).toEqual([{ node_id: "action-1", motivo: { tipo: "item_sem_link", item: 1 } }]);
  });

  it("link preenchido (ou variável) não é acusado", () => {
    const g = grafo([
      gatilho,
      conteudo("action-1", [
        { type: "document", url: "https://arquivos.publico.teste/a.pdf" },
        { type: "image", url: "{{url_imagem_lead}}" },
      ]),
      fim,
    ]);
    expect(rascunhoIncompleto(g).caixas).toEqual([]);
  });
});
