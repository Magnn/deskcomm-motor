/**
 * O catálogo de modelos prontos tem de passar pela revisão da Meta como está.
 * Cada regra daqui é uma recusa que chegaria horas depois do envio.
 */
import { describe, expect, it } from "vitest";

import { MODELOS_PRONTOS } from "@/lib/channels/modelos-prontos";
import {
  contarVariaveis,
  LIMITE_BOTOES,
  LIMITE_CORPO,
  montarComponents,
} from "@/lib/channels/template-conteudo";
import { ehPedidoDeOptOut } from "@/lib/opt-out/deteccao";

const LIMITE_TEXTO_DO_BOTAO = 25;

/** Linguagem de venda que não cabe em modelo de utilidade. */
const TOM_DE_VENDA =
  /desconto|oferta|promo[cç][aã]o|aproveite|compre|n[aã]o perca|[uú]ltima chance|imperd[ií]vel|exclusiv|pre[cç]o especial|ganhe|economize|s[oó] hoje|b[oô]nus|brinde|frete gr[aá]tis|liquida[cç][aã]o/i;

describe.each(MODELOS_PRONTOS.map((m) => [m.name, m] as const))("modelo pronto %s", (_, modelo) => {
  it("o nome é aceito pela Meta", () => {
    expect(modelo.name).toMatch(/^[a-z0-9_]+$/);
  });

  it("corpo dentro do limite, sem começar nem terminar em variável", () => {
    expect(modelo.body.length).toBeLessThanOrEqual(LIMITE_CORPO);
    expect(modelo.body).not.toMatch(/^\s*\{\{/);
    expect(modelo.body).not.toMatch(/\}\}\s*[.!?]?\s*$/);
    expect(modelo.body).not.toMatch(/\}\}\s*\{\{/);
  });

  it("traz uma amostra preenchida para cada variável", () => {
    expect(modelo.exemplos).toHaveLength(contarVariaveis(modelo.body));
    expect(modelo.exemplos.every((e) => e.trim().length > 0)).toBe(true);
  });

  it("variáveis levam dado do contato, não um texto livre de disparo", () => {
    expect(contarVariaveis(modelo.body)).toBeLessThanOrEqual(5);
    expect(modelo.exemplos.every((e) => e.length <= 30)).toBe(true);
  });

  it("botões dentro do limite", () => {
    expect(modelo.botoes.length).toBeLessThanOrEqual(LIMITE_BOTOES);
    for (const b of modelo.botoes) {
      expect(b.texto.length).toBeLessThanOrEqual(LIMITE_TEXTO_DO_BOTAO);
    }
  });

  it("monta os components com as amostras no formato da revisão", () => {
    const components = montarComponents({
      body: modelo.body,
      footer: modelo.footer,
      exemplos: modelo.exemplos,
      botoes: modelo.botoes,
    }) as Array<{ type: string; example?: { body_text: string[][] } }>;
    const corpo = components.find((c) => c.type === "BODY");
    expect(corpo?.example?.body_text).toEqual([modelo.exemplos]);
    expect(components.at(-1)?.type).toBe("BUTTONS");
  });
});

describe("catálogo de modelos prontos", () => {
  it("nomes únicos", () => {
    const nomes = MODELOS_PRONTOS.map((m) => m.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("utilidade não usa linguagem de venda", () => {
    for (const m of MODELOS_PRONTOS.filter((x) => x.category === "UTILITY")) {
      expect(`${m.name}: ${m.body}`).not.toMatch(TOM_DE_VENDA);
    }
  });

  it("todo marketing dá saída, e o botão de saída bloqueia de verdade", () => {
    for (const m of MODELOS_PRONTOS.filter((x) => x.category === "MARKETING")) {
      expect(m.botoes.some((b) => ehPedidoDeOptOut(b.texto))).toBe(true);
    }
    expect(ehPedidoDeOptOut("Parar de receber")).toBe(true);
  });
});
