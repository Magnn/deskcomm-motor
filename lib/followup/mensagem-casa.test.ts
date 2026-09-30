import { describe, expect, it } from "vitest";

import { triggerConfigSchema } from "./api-schemas";
import { mensagemDisparaFluxo, normalizarTexto, palavraCasa } from "./mensagem-casa";

describe("normalizarTexto", () => {
  it("tira acento, caixa e pontuação das pontas", () => {
    expect(normalizarTexto("  QUÉRO!!  ")).toBe("quero");
    expect(normalizarTexto("Olá,  tudo   bem?")).toBe("ola, tudo bem");
  });
});

describe("palavraCasa", () => {
  it("contém: casa a palavra como palavra, não como pedaço de outra", () => {
    expect(palavraCasa("Oi, eu QUERO o preço", ["quero"], "contains")).toBe(true);
    expect(palavraCasa("isso é simples", ["sim"], "contains")).toBe(false);
  });

  it("contém: casa expressão de várias palavras", () => {
    expect(palavraCasa("quero iniciar meu atendimento agora", ["iniciar meu atendimento"], "contains")).toBe(true);
  });

  it("exata: só a mensagem inteira", () => {
    expect(palavraCasa("Quero!", ["quero"], "equals")).toBe(true);
    expect(palavraCasa("quero sim", ["quero"], "equals")).toBe(false);
  });

  it("mídia sem legenda e lista vazia nunca casam", () => {
    expect(palavraCasa(null, ["quero"], "contains")).toBe(false);
    expect(palavraCasa("quero", [], "contains")).toBe(false);
    expect(palavraCasa("quero", ["   "], "contains")).toBe(false);
  });
});

describe("mensagemDisparaFluxo", () => {
  it("any dispara sempre", () => {
    expect(mensagemDisparaFluxo({ match: "any" }, null, false)).toBe(true);
  });

  it("first_message só dispara na primeira do contato", () => {
    expect(mensagemDisparaFluxo({ match: "first_message" }, "oi", true)).toBe(true);
    expect(mensagemDisparaFluxo({ match: "first_message" }, "oi", false)).toBe(false);
  });

  it("keyword usa o modo escolhido (contém por padrão)", () => {
    const p = { match: "keyword" as const, keywords: ["quero"] };
    expect(mensagemDisparaFluxo(p, "eu quero sim", false)).toBe(true);
    expect(mensagemDisparaFluxo({ ...p, keyword_mode: "equals" }, "eu quero sim", false)).toBe(false);
  });
});

describe("triggerConfigSchema — inbound_message", () => {
  it("aceita qualquer mensagem e primeira mensagem", () => {
    expect(triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "any" } }).success).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "first_message" } }).success).toBe(true);
  });

  it("palavra-chave exige ao menos uma palavra (fluxo ativo que nunca dispara é o defeito)", () => {
    expect(triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "keyword" } }).success).toBe(false);
    expect(
      triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "keyword", keywords: [] } }).success,
    ).toBe(false);
    expect(
      triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "keyword", keywords: ["quero"] } })
        .success,
    ).toBe(true);
  });

  it("recusa campo desconhecido e modo inválido", () => {
    expect(triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "any", x: 1 } }).success).toBe(false);
    expect(triggerConfigSchema.safeParse({ kind: "inbound_message", params: { match: "regex" } }).success).toBe(false);
  });
});
