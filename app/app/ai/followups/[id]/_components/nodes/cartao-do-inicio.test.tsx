import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { TriggerNodeConfig } from "@/lib/followup/graph-schema";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@xyflow/react", () => ({
  Handle: ({ children }: { children?: React.ReactNode }) => <div data-testid="handle">{children}</div>,
  NodeToolbar: () => null,
  Position: { Right: "right", Top: "top" },
}));

const { TriggerNode } = await import("./TriggerNode");

/**
 * O cartão "Início" mostra O QUE A CAIXA TEM. Antes ele lia origem, evento e
 * palavra-chave do localStorage do navegador, exibia "quero iniciar meu
 * atendimento" quando não havia palavra nenhuma e um selo "1" que não contava
 * coisa alguma — nenhum dos três vinha do fluxo.
 */
function cartao(config: TriggerNodeConfig) {
  const props = { id: "trigger_1", data: { label: "Início do fluxo", config }, selected: false } as never;
  render(<TriggerNode {...(props as object as Parameters<typeof TriggerNode>[0])} />);
  return {
    titulo: screen.getByTestId("inicio-titulo").textContent,
    descricao: screen.getByTestId("inicio-descricao").textContent,
    resumo: screen.getByTestId("inicio-resumo").textContent,
    tudo: screen.getByTestId("trigger-node-trigger_1").textContent ?? "",
  };
}

describe("cartão Início — sem dado inventado", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("palavra-chave configurada: o cartão mostra a palavra da CAIXA", () => {
    const c = cartao({ integration: "whatsapp", event: "keyword", keyword: "quero saber mais" });
    expect(c).toMatchObject({
      titulo: "Mensagem recebida",
      descricao: "Ao receber uma palavra-chave",
      resumo: "quero saber mais",
    });
  });

  it("o que está no navegador NÃO aparece: a fonte é a caixa, não o localStorage", () => {
    localStorage.setItem("flow_keyword_trigger_1", "palavra do navegador");
    localStorage.setItem("flow_provider_trigger_1", "kiwify");
    const c = cartao({ integration: "whatsapp", event: "message_received" });
    expect(c.tudo).not.toContain("palavra do navegador");
    expect(c.tudo).not.toContain("Kiwify");
    expect(c.resumo).toBe("Qualquer mensagem");
  });

  it("caixa vazia (fluxo antigo): diz 'qualquer mensagem' — é o que o motor faz — e não inventa palavra", () => {
    const c = cartao({});
    expect(c.descricao).toBe("Ao receber qualquer mensagem");
    expect(c.resumo).toBe("Qualquer mensagem");
    expect(c.tudo).not.toContain("quero iniciar meu atendimento");
  });

  it("não há selo de contagem inventado", () => {
    const c = cartao({ integration: "whatsapp", event: "keyword", keyword: "oi" });
    // O texto do cartão é só título + descrição + resumo: nenhum "1" solto.
    expect(c.tudo.replace(c.titulo ?? "", "").replace(c.descricao ?? "", "").replace(c.resumo ?? "", "").trim()).toBe("");
  });

  it("palavra-chave em branco: o cartão avisa, em vez de exibir um exemplo", () => {
    expect(cartao({ integration: "whatsapp", event: "keyword", keyword: "  " }).resumo).toBe("Palavra-chave em branco");
  });

  it("primeiro contato", () => {
    const c = cartao({ integration: "whatsapp", event: "inicio_conversa" });
    expect(c).toMatchObject({ descricao: "No primeiro contato", resumo: "Primeira mensagem do contato" });
  });

  it("origem que ainda não dispara: o cartão diz isso, com o nome da origem", () => {
    const c = cartao({ integration: "hotmart", event: "purchase" });
    expect(c).toMatchObject({
      titulo: "Hotmart",
      descricao: "Esta origem ainda não dispara o fluxo",
      resumo: "Use a origem WhatsApp",
    });
  });
});
