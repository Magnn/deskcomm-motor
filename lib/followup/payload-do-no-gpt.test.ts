import { describe, expect, it } from "vitest";

import type { FlowNode } from "./graph-schema";
import { turnPayloadExtras } from "./engine";

const no = (config: Record<string, unknown>): FlowNode =>
  ({
    id: "g1",
    type: "ai_generic",
    label: "GPT",
    position: { x: 0, y: 0 },
    config: { prompt: "resuma", save_to: { kind: "lead_custom", key: "r" }, ...config },
  }) as FlowNode;

describe("payload do turno do nó GPT — as opções salvas na tela chegam ao turno", () => {
  it("sem opções, só o prompt (nada inventado)", () => {
    expect(turnPayloadExtras(no({}), [])).toEqual({ prompt_hint: "resuma" });
  });

  it("leva exatamente as opções configuradas", () => {
    const p = turnPayloadExtras(
      no({
        modelo_gpt: "gpt-4o",
        temperature: 0.3,
        max_tokens: 500,
        enviar_resultado_texto: true,
        manter_contexto: false,
        leitura_imagem_pdf: false,
        ativar_personalidade: true,
        ativar_base_informacoes: true,
        ativar_restricoes: true,
        salvar_em_campo: false,
      }),
      [],
    );
    expect(p).toEqual({
      prompt_hint: "resuma",
      generic_ai_opcoes: {
        modelo_gpt: "gpt-4o",
        temperature: 0.3,
        max_tokens: 500,
        enviar_resultado_texto: true,
        manter_contexto: false,
        leitura_imagem_pdf: false,
        ativar_personalidade: true,
        ativar_base_informacoes: true,
        ativar_restricoes: true,
        salvar_em_campo: false,
      },
    });
  });

  it("um false explícito viaja (é decisão do dono, não ausência)", () => {
    expect(turnPayloadExtras(no({ manter_contexto: false }), []).generic_ai_opcoes).toEqual({ manter_contexto: false });
  });
});
