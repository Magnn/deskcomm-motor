import { describe, expect, it } from "vitest";

import { rascunhoIncompleto } from "./caixas-incompletas";
import { configDoInicio, eventoWhatsappDoInicio, mensagemAbreOFluxo, normalizarParaGatilho } from "./gatilho-do-inicio";
import type { FlowGraph, TriggerNodeConfig } from "./graph-schema";
import { validateFlowForPublish } from "./validate-publish";

const pos = { x: 0, y: 0 };
const grafo = (config: TriggerNodeConfig): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger", label: "Início do fluxo", position: pos, config },
    { id: "a", type: "action", label: "Boas-vindas", position: pos, config: { mode: "content", items: [{ type: "text", body: "oi" }] } },
  ],
  edges: [{ id: "e1", source: "t", target: "a", priority: 0, condition: { type: "always" } }],
});

const msg = (texto: string | null, primeiraDoContato = false) => ({ texto, primeiraDoContato });

describe("a caixa Início — o que o formulário grava pode ser SALVO", () => {
  // O defeito: o formulário gravava origem/evento/palavra-chave e o schema só
  // aceitava `{}`. Bastava abrir a caixa e mexer para o fluxo nunca mais salvar
  // ("Esta caixa ainda não foi configurada por completo").
  it("exatamente o que o formulário escreve passa no schema do rascunho", () => {
    const doFormulario: TriggerNodeConfig = {
      integration: "whatsapp",
      event: "keyword",
      keyword: "quero comprar",
      tag: "",
      custom_field: "",
      inactivity_hours: 24,
    };
    expect(rascunhoIncompleto(grafo(doFormulario))).toEqual({ caixas: [], doFluxo: false });
  });

  it("a caixa vazia de todo fluxo antigo continua valendo", () => {
    expect(rascunhoIncompleto(grafo({}))).toEqual({ caixas: [], doFluxo: false });
    expect(validateFlowForPublish(grafo({}))).toEqual({ ok: true });
  });

  it("origem sem motor salva no rascunho, mas NÃO publica — e diz por quê", () => {
    const g = grafo({ integration: "hotmart", event: "purchase" });
    expect(rascunhoIncompleto(g).caixas).toEqual([]);
    const r = validateFlowForPublish(g);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => [e.node_id, e.code])).toEqual([["t", "inicio_com_origem_em_construcao"]]);
      expect(r.errors[0]!.message).toContain('"Início do fluxo"');
    }
  });

  it("palavra-chave em branco não publica: o fluxo nunca abriria", () => {
    const r = validateFlowForPublish(grafo({ integration: "whatsapp", event: "keyword", keyword: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(["inicio_sem_palavra_chave"]);
  });

  it("palavra-chave preenchida e qualquer-mensagem publicam", () => {
    expect(validateFlowForPublish(grafo({ integration: "whatsapp", event: "keyword", keyword: "oi" }))).toEqual({ ok: true });
    expect(validateFlowForPublish(grafo({ integration: "whatsapp", event: "message_received", keyword: "" }))).toEqual({ ok: true });
  });
});

describe("a mensagem que chega abre o fluxo?", () => {
  it("caixa vazia: qualquer mensagem abre (o que o número vinculado já fazia)", () => {
    expect(mensagemAbreOFluxo({}, msg("bom dia"))).toEqual({ entra: true });
    expect(mensagemAbreOFluxo(undefined, msg(null))).toEqual({ entra: true });
  });

  it("palavra-chave: abre quando a mensagem CONTÉM a palavra, sem ligar para caixa, acento ou espaço", () => {
    const cfg: TriggerNodeConfig = { integration: "whatsapp", event: "keyword", keyword: "Quero  Promoção" };
    expect(mensagemAbreOFluxo(cfg, msg("oi! QUERO promocao, por favor"))).toEqual({ entra: true });
    expect(mensagemAbreOFluxo(cfg, msg("bom dia"))).toEqual({ entra: false, motivo: "palavra_chave_nao_casou" });
    expect(mensagemAbreOFluxo(cfg, msg(null))).toEqual({ entra: false, motivo: "palavra_chave_nao_casou" });
  });

  it("palavra-chave em branco (versão antiga publicada assim): não abre para ninguém", () => {
    expect(mensagemAbreOFluxo({ integration: "whatsapp", event: "keyword", keyword: "" }, msg("oi"))).toEqual({
      entra: false,
      motivo: "palavra_chave_vazia",
    });
  });

  it("primeiro contato: só a primeira mensagem do contato abre", () => {
    const cfg: TriggerNodeConfig = { integration: "whatsapp", event: "inicio_conversa" };
    expect(mensagemAbreOFluxo(cfg, msg("oi", true))).toEqual({ entra: true });
    expect(mensagemAbreOFluxo(cfg, msg("oi", false))).toEqual({ entra: false, motivo: "nao_e_o_primeiro_contato" });
  });

  it("origem que não é WhatsApp: mensagem não abre o fluxo", () => {
    expect(mensagemAbreOFluxo({ integration: "crm", event: "tag_added" }, msg("oi"))).toEqual({
      entra: false,
      motivo: "origem_nao_e_mensagem",
    });
  });

  it("sem evento escolhido: palavra-chave preenchida vale como palavra-chave", () => {
    expect(eventoWhatsappDoInicio({ keyword: "oi" })).toBe("keyword");
    expect(eventoWhatsappDoInicio({ keyword: "  " })).toBe("message_received");
  });

  it("normalização e leitura da caixa no grafo", () => {
    expect(normalizarParaGatilho("  Olá,   MUNDO ")).toBe("ola, mundo");
    expect(configDoInicio(grafo({ keyword: "x" }))).toEqual({ keyword: "x" });
  });
});
