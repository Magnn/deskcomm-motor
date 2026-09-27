import { describe, expect, it } from "vitest";

import { CAMPOS_RASCUNHAVEIS, definicaoDoCampo, ehCampoRascunhavel, rascunhoInputSchema } from "./tipos";

describe("rascunhoInputSchema", () => {
  it("aceita campo e contexto válidos", () => {
    expect(
      rascunhoInputSchema.safeParse({ campo: "identidade", contexto: "uma clínica de estética em Fortaleza" })
        .success,
    ).toBe(true);
  });

  it("recusa campo fora do vocabulário fechado", () => {
    expect(rascunhoInputSchema.safeParse({ campo: "oferta", contexto: "uma clínica de estética" }).success).toBe(
      false,
    );
  });

  it("recusa contexto curto demais", () => {
    expect(rascunhoInputSchema.safeParse({ campo: "identidade", contexto: "oi" }).success).toBe(false);
  });

  it("recusa contexto maior que o teto", () => {
    expect(rascunhoInputSchema.safeParse({ campo: "identidade", contexto: "x".repeat(601) }).success).toBe(false);
  });

  it("é estrito: campo desconhecido no corpo é recusado", () => {
    expect(
      rascunhoInputSchema.safeParse({ campo: "identidade", contexto: "uma clínica de estética", extra: 1 }).success,
    ).toBe(false);
  });
});

describe("ehCampoRascunhavel / definicaoDoCampo", () => {
  it("todo campo da lista tem definição, com system prompt não vazio", () => {
    for (const campo of CAMPOS_RASCUNHAVEIS) {
      const def = definicaoDoCampo(campo);
      expect(def.system.length).toBeGreaterThan(0);
    }
  });

  it("ehCampoRascunhavel reconhece só os campos da lista", () => {
    expect(ehCampoRascunhavel("identidade")).toBe(true);
    expect(ehCampoRascunhavel("limites")).toBe(true);
    expect(ehCampoRascunhavel("oferta")).toBe(false);
    expect(ehCampoRascunhavel("qualquer-coisa")).toBe(false);
  });
});
