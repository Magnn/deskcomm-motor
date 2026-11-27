import { describe, expect, it } from "vitest";

import {
  agenteDoPainel,
  agentePadraoDoPainel,
  nomeComparavel,
  nomesDosProdutosDoAgente,
  vendaEhDoAgente,
} from "./vendas-do-agente";

const config = {
  pricing: {
    enabled: true,
    list_price_cents: 13000,
    list_product_links: [{ name: "Abertura do Coração", url: "https://exemplo.test/a" }],
    extras: [{ name: "Pergunta nova", price_cents: 700, when: "quando ela pedir outra pergunta" }],
    steps: [],
  },
  catalog: { enabled: true, produtos: [] },
};

describe("vendas do agente", () => {
  const nomes = nomesDosProdutosDoAgente(config);

  it("lê os nomes da aba Preço", () => {
    expect(nomes.has("abertura do coracao")).toBe(true);
    expect(nomes.has("pergunta nova")).toBe(true);
  });

  it("compara sem quantidade e sem acento", () => {
    expect(nomeComparavel("2× Pergunta nova")).toBe("pergunta nova");
    expect(nomeComparavel(" Abertura do Coração ")).toBe("abertura do coracao");
  });

  it("contato atendido pelo agente é dele, qualquer produto (área do cliente inclusive)", () => {
    expect(vendaEhDoAgente({ contact_id: "c1", notes: "30 créditos" }, new Set(["c1"]), nomes)).toBe(true);
  });

  it("contato que o agente nunca atendeu não é dele, mesmo com nome do catálogo", () => {
    expect(vendaEhDoAgente({ contact_id: "c2", notes: "Pergunta nova" }, new Set(["c1"]), nomes)).toBe(false);
  });

  it("sem contato: decide pelo nome do produto", () => {
    expect(vendaEhDoAgente({ contact_id: null, notes: "3× Pergunta nova" }, new Set(), nomes)).toBe(true);
    expect(vendaEhDoAgente({ contact_id: null, notes: "Pacote de outra oferta" }, new Set(), nomes)).toBe(false);
    expect(vendaEhDoAgente({ contact_id: null, notes: null }, new Set(), nomes)).toBe(false);
  });

  it("config sem preço nem catálogo não tem nome nenhum", () => {
    expect(nomesDosProdutosDoAgente({}).size).toBe(0);
    expect(nomesDosProdutosDoAgente(null).size).toBe(0);
  });
});

describe("agente do painel", () => {
  const agentes = [{ id: "a1" }, { id: "a2" }];
  const settings = { painel: { agente_id: "a1" } };

  it("sem nada na URL vale o padrão da organização", () => {
    expect(agenteDoPainel(null, settings, agentes)?.id).toBe("a1");
  });
  it("a URL vence o padrão", () => {
    expect(agenteDoPainel("a2", settings, agentes)?.id).toBe("a2");
  });
  it("'todos' tira o recorte", () => {
    expect(agenteDoPainel("todos", settings, agentes)).toBeNull();
  });
  it("id de fora da organização não recorta nada", () => {
    expect(agenteDoPainel("outro", settings, agentes)).toBeNull();
    expect(agenteDoPainel(null, { painel: { agente_id: "arquivado" } }, agentes)).toBeNull();
  });
  it("sem padrão gravado, organização inteira", () => {
    expect(agenteDoPainel(null, {}, agentes)).toBeNull();
    expect(agentePadraoDoPainel(null)).toBeNull();
  });
});
