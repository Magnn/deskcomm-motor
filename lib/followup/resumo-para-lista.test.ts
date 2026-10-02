import { describe, expect, it } from "vitest";

import { fluxoPassaNosFiltros } from "@/app/app/ai/followups/_components/FlowsList";

import { origemDoInicioDoRascunho, resumirFluxosDaLista } from "./resumo-para-lista";

/**
 * Os filtros da lista de fluxos lêem o dado do FLUXO, não o que ficou guardado
 * no navegador de quem o criou.
 */
const rascunho = (config: unknown) => ({
  nodes: [
    { id: "a", type: "action", config: { mode: "content", items: [] } },
    { id: "t", type: "trigger", config },
  ],
  edges: [],
});

describe("origem da caixa Início, tirada do rascunho", () => {
  it("origem configurada", () => {
    expect(origemDoInicioDoRascunho(rascunho({ integration: "hotmart", event: "purchase" }))).toBe("hotmart");
  });

  it("caixa vazia, rascunho ausente ou sem Início: WhatsApp — é o que o motor faz", () => {
    expect(origemDoInicioDoRascunho(rascunho({}))).toBe("whatsapp");
    expect(origemDoInicioDoRascunho(null)).toBe("whatsapp");
    expect(origemDoInicioDoRascunho({ nodes: [] })).toBe("whatsapp");
    expect(origemDoInicioDoRascunho({ nodes: "x" })).toBe("whatsapp");
  });

  it("valor fora do vocabulário não vira origem inventada", () => {
    expect(origemDoInicioDoRascunho(rascunho({ integration: "perfectpay" }))).toBe("whatsapp");
  });
});

describe("o resumo da lista", () => {
  const linhas = [
    { id: "f1", name: "Funil", draft_graph: rascunho({ integration: "webhook" }) },
    { id: "f2", name: "Boas-vindas", draft_graph: null },
  ];
  const resumo = resumirFluxosDaLista(linhas, new Map([["f1", ["oficial", "qr"] as Array<"oficial" | "qr">]]));

  it("leva a origem e os tipos de número de cada fluxo", () => {
    expect(resumo).toEqual([
      { id: "f1", name: "Funil", inicio_origem: "webhook", numeros: ["oficial", "qr"] },
      { id: "f2", name: "Boas-vindas", inicio_origem: "whatsapp", numeros: [] },
    ]);
  });

  it("o rascunho inteiro NÃO segue para a tela", () => {
    expect(resumo.some((r) => "draft_graph" in r)).toBe(false);
  });
});

describe("filtros da lista", () => {
  const oficial = { inicio_origem: "whatsapp", numeros: ["oficial"] as Array<"oficial" | "qr"> };
  const porQr = { inicio_origem: "webhook", numeros: ["qr"] as Array<"oficial" | "qr"> };
  const semNumero = { inicio_origem: "whatsapp", numeros: [] as Array<"oficial" | "qr"> };

  it("'Todos' mostra tudo, inclusive fluxo sem número vinculado", () => {
    for (const f of [oficial, porQr, semNumero]) expect(fluxoPassaNosFiltros(f, "todos", "todos")).toBe(true);
  });

  it("canal: só o fluxo que é dono de um número daquele tipo", () => {
    expect(fluxoPassaNosFiltros(oficial, "oficial", "todos")).toBe(true);
    expect(fluxoPassaNosFiltros(porQr, "oficial", "todos")).toBe(false);
    expect(fluxoPassaNosFiltros(porQr, "business", "todos")).toBe(true);
    // Sem número vinculado não é de canal nenhum — antes aparecia como "App Business".
    expect(fluxoPassaNosFiltros(semNumero, "business", "todos")).toBe(false);
    expect(fluxoPassaNosFiltros(semNumero, "oficial", "todos")).toBe(false);
  });

  it("gatilho: pela origem da caixa Início", () => {
    expect(fluxoPassaNosFiltros(porQr, "todos", "webhook")).toBe(true);
    expect(fluxoPassaNosFiltros(oficial, "todos", "webhook")).toBe(false);
  });

  it("resposta antiga, sem os campos novos: vale WhatsApp e nenhum número — a lista não quebra", () => {
    expect(fluxoPassaNosFiltros({}, "todos", "whatsapp")).toBe(true);
    expect(fluxoPassaNosFiltros({}, "oficial", "todos")).toBe(false);
  });
});
