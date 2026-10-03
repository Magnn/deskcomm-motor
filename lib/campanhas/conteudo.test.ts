import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { conteudoMudou, lerConteudo, textoComVariaveis, tipoDoConteudo } from "./conteudo";
import { despacharConteudo, type DepsDoDespacho, type PedidoDeDespacho } from "./despacho";
import { fluxoParaCampanha } from "./fluxo-da-campanha";

describe("lerConteudo", () => {
  it("campanha antiga (sem tipo) continua sendo texto", () => {
    expect(tipoDoConteudo({})).toBe("text");
    expect(lerConteudo({ message_body: " Olá {{nome}} " })).toEqual({ ok: true, conteudo: { kind: "text", corpo: "Olá {{nome}}" } });
  });

  it("cada tipo diz o que falta, com a frase de quem vai preencher", () => {
    expect(lerConteudo({ content_kind: "text", message_body: "  " })).toMatchObject({ ok: false, falta: expect.stringContaining("Escreva a mensagem") });
    expect(lerConteudo({ content_kind: "template", template_name: "promo" })).toMatchObject({ ok: false, falta: expect.stringContaining("modelo aprovado") });
    expect(lerConteudo({ content_kind: "flow" })).toMatchObject({ ok: false, falta: expect.stringContaining("fluxo") });
  });

  it("modelo e fluxo completos; valor que não é texto é descartado", () => {
    expect(lerConteudo({ content_kind: "template", template_name: "promo", template_language: "pt_BR", template_values: { "body.1": "{{nome}}", lixo: 3 } })).toEqual({
      ok: true,
      conteudo: { kind: "template", nome: "promo", idioma: "pt_BR", valores: { "body.1": "{{nome}}" } },
    });
    expect(lerConteudo({ content_kind: "flow", flow_pointer_id: "f1", message_body: "ignorado" })).toEqual({ ok: true, conteudo: { kind: "flow", fluxoId: "f1" } });
  });

  it("as variáveis aparecem no corpo, nos valores do modelo, e em lugar nenhum do fluxo", () => {
    expect(textoComVariaveis({ kind: "text", corpo: "Oi {{nome}}" })).toBe("Oi {{nome}}");
    expect(textoComVariaveis({ kind: "template", nome: "p", idioma: "pt_BR", valores: { a: "{{nome}}", b: "10%" } })).toBe("{{nome}}\n10%");
    expect(textoComVariaveis({ kind: "flow", fluxoId: "f" })).toBe("");
  });

  it("trocar o tipo, o modelo ou o fluxo é mudar o conteúdo; salvar igual não é", () => {
    const texto = { content_kind: "text", message_body: "Oi" };
    expect(conteudoMudou(texto, { ...texto })).toBe(false);
    expect(conteudoMudou(texto, { ...texto, message_body: "Olá" })).toBe(true);
    expect(conteudoMudou(texto, { content_kind: "flow", flow_pointer_id: "f1" })).toBe(true);
    const modelo = { content_kind: "template", template_name: "a", template_language: "pt_BR", template_values: {} };
    expect(conteudoMudou(modelo, { ...modelo, template_name: "b" })).toBe(true);
  });
});

const fronteira = { conversation_id: "cv1" } as PedidoDeDespacho["boundary"];
const pedido = (conteudo: PedidoDeDespacho["conteudo"], extra: Partial<PedidoDeDespacho> = {}): PedidoDeDespacho => ({
  organizationId: "org-1",
  contactId: "c1",
  boundary: fronteira,
  conteudo,
  renderizar: (texto) => texto.replaceAll("{{nome}}", "Ana"),
  previaDoModelo: null,
  ator: "campaign:x",
  requestId: "campaign:x:r1",
  metadata: { source: "campaign" },
  ...extra,
});

function deps(over: Partial<DepsDoDespacho> = {}) {
  // Tipados pelos argumentos reais: o teste lê o que foi passado a cada um.
  const enviar = vi.fn(async (..._args: unknown[]) => ({ id: "m1", status: "sent" }));
  const inscrever = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, enrollment: {} }));
  return { enviar, inscrever, d: { enviar, inscrever, ...over } as unknown as DepsDoDespacho };
}

describe("despacharConteudo", () => {
  it("texto: sai como mensagem de texto, com as variáveis resolvidas", async () => {
    const { enviar, inscrever, d } = deps();
    const r = await despacharConteudo({} as SupabaseClient, pedido({ kind: "text", corpo: "Oi {{nome}}" }, { internalMessageId: "mid" }), d);
    expect(r).toEqual({ via: "mensagem", falhou: false, status: "sent", messageId: "m1" });
    expect(enviar.mock.calls[0]?.[2]).toMatchObject({ conversation_id: "cv1", type: "text", body: "Oi Ana" });
    expect(enviar.mock.calls[0]?.[1]).toMatchObject({ internalMessageId: "mid", organization_id: "org-1" });
    expect(inscrever).not.toHaveBeenCalled();
  });

  it("modelo: sai como template, com os valores resolvidos e um corpo (a prévia) — sem corpo o envio nem sai", async () => {
    const { enviar, d } = deps();
    await despacharConteudo(
      {} as SupabaseClient,
      pedido({ kind: "template", nome: "promo", idioma: "pt_BR", valores: { "body.1": "{{nome}}" } }, { previaDoModelo: "Olá {{nome}}, temos novidade" }),
      d,
    );
    expect(enviar.mock.calls[0]?.[2]).toMatchObject({
      type: "template",
      template_name: "promo",
      template_language: "pt_BR",
      template_values: { "body.1": "Ana" },
      body: "Olá Ana, temos novidade",
    });
  });

  it("modelo sem prévia guardada: o corpo cai para o nome do modelo, nunca vazio", async () => {
    const { enviar, d } = deps();
    await despacharConteudo({} as SupabaseClient, pedido({ kind: "template", nome: "promo", idioma: "pt_BR", valores: {} }), d);
    expect((enviar.mock.calls[0]?.[2] as { body: string }).body).toBe("promo");
  });

  it("fluxo: INSCREVE pela fronteira do número escolhido e não manda mensagem", async () => {
    const { enviar, inscrever, d } = deps();
    const r = await despacharConteudo({} as SupabaseClient, pedido({ kind: "flow", fluxoId: "f1" }), d);
    expect(r).toEqual({ via: "fluxo", falhou: false, motivo: null });
    expect(enviar).not.toHaveBeenCalled();
    const entrada = inscrever.mock.calls[0]?.[1] as { pointerId: string; contactId: string; resolveServiceBoundary: () => Promise<unknown> };
    expect(entrada).toMatchObject({ pointerId: "f1", contactId: "c1", organizationId: "org-1" });
    await expect(entrada.resolveServiceBoundary()).resolves.toBe(fronteira);
  });

  it("fluxo que recusa (já está em outro fluxo, não publicado) vira falha com o motivo", async () => {
    const { d } = deps({ inscrever: vi.fn(async () => ({ ok: false as const, code: "conflict", message: "Este contato já está em um follow-up ativo.", status: 409 })) as never });
    const r = await despacharConteudo({} as SupabaseClient, pedido({ kind: "flow", fluxoId: "f1" }), d);
    expect(r).toEqual({ via: "fluxo", falhou: true, motivo: "conflict: Este contato já está em um follow-up ativo." });
  });

  it("mensagem que o canal marcou como falha é falha, mesmo sem exceção", async () => {
    const { d } = deps({ enviar: vi.fn(async () => ({ id: "m2", status: "failed" })) as never });
    const r = await despacharConteudo({} as SupabaseClient, pedido({ kind: "text", corpo: "x" }), d);
    expect(r).toMatchObject({ via: "mensagem", falhou: true });
  });
});

describe("fluxoParaCampanha", () => {
  const banco = () =>
    criarBancoEmMemoria({
      followup_flow_pointers: [
        { id: "f1", organization_id: "org-1", name: "Boas-vindas", status: "active", active_version_id: "v1", surface: "followup" },
        { id: "f2", organization_id: "org-1", name: "Rascunho", status: "draft", active_version_id: null, surface: "followup" },
        { id: "f3", organization_id: "org-1", name: "Roteiro", status: "active", active_version_id: "v3", surface: "atendimento" },
        { id: "alheio", organization_id: "org-2", name: "De outra empresa", status: "active", active_version_id: "v9", surface: "followup" },
      ],
    }).cliente as unknown as SupabaseClient;

  it("fluxo de OUTRA empresa não é encontrado — a chave estrangeira sozinha deixaria passar", async () => {
    await expect(fluxoParaCampanha(banco(), "org-1", "alheio")).resolves.toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("roteiro de atendimento é recusado; rascunho é aceito, avisando que não está publicado", async () => {
    await expect(fluxoParaCampanha(banco(), "org-1", "f3")).resolves.toEqual({ ok: false, motivo: "roteiro_de_atendimento" });
    await expect(fluxoParaCampanha(banco(), "org-1", "f2")).resolves.toEqual({ ok: true, nome: "Rascunho", publicado: false });
    await expect(fluxoParaCampanha(banco(), "org-1", "f1")).resolves.toEqual({ ok: true, nome: "Boas-vindas", publicado: true });
  });
});
