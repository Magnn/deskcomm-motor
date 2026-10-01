import { describe, it, expect } from "vitest";
import {
  webchatConfigSchema,
  isDomainAuthorized,
} from "@/lib/channels/webchat/schema";
import {
  generateScriptEmbedCode,
  generateIframeEmbedCode,
  generateDirectChatUrl,
} from "@/lib/channels/webchat/embed-code";
import {
  instagramCommentAutomationSchema,
  matchesCommentRule,
  pickPublicReply,
} from "@/lib/channels/instagram/comments-schema";

describe("Canais - Webchat Widget", () => {
  it("valida e aplica defaults para configuração de webchat", () => {
    const config = webchatConfigSchema.parse({
      id: "wc-123",
      name: "Chat Site Principal",
    });

    expect(config.name).toBe("Chat Site Principal");
    expect(config.brandColor).toBe("#0ea5e9");
    expect(config.position).toBe("bottom_right");
    expect(config.allowAnyDomain).toBe(true);
    expect(config.isActive).toBe(true);
  });

  it("verifica autorização de domínio corretamente com wildcards", () => {
    const restricted = {
      allowAnyDomain: false,
      authorizedDomains: ["meusite.com.br", "*.appempresa.com", "localhost"],
    };

    expect(isDomainAuthorized("https://meusite.com.br", restricted)).toBe(true);
    expect(isDomainAuthorized("https://meusite.com.br:8080", restricted)).toBe(true);
    expect(isDomainAuthorized("https://blog.appempresa.com", restricted)).toBe(true);
    expect(isDomainAuthorized("https://appempresa.com", restricted)).toBe(true);
    expect(isDomainAuthorized("http://localhost:3000", restricted)).toBe(true);
    expect(isDomainAuthorized("https://hacker.com", restricted)).toBe(false);
  });

  it("gera código de incorporação script e iframe válidos", () => {
    const config = webchatConfigSchema.parse({
      id: "wc-test-01",
      name: "Widget Suporte",
      brandColor: "#6366f1",
      position: "bottom_left",
      title: "Suporte 24h",
    });

    const script = generateScriptEmbedCode({
      webchat: config,
      baseUrl: "https://crm.invalid",
    });
    expect(script).toContain('data-webchat-id="wc-test-01"');
    expect(script).toContain('data-color="#6366f1"');
    expect(script).toContain('data-position="bottom_left"');
    expect(script).toContain("/widget/webchat.js");

    const iframe = generateIframeEmbedCode({
      webchat: config,
      baseUrl: "https://crm.invalid",
    });
    expect(iframe).toContain('src="https://crm.invalid/webchat/wc-test-01"');
    expect(iframe).toContain('title="Suporte 24h"');

    const directUrl = generateDirectChatUrl("wc-test-01", "https://crm.invalid");
    expect(directUrl).toBe("https://crm.invalid/webchat/wc-test-01");
  });
});

describe("Canais - Automações de Comentários do Instagram", () => {
  it("valida regra de comentário com valores padrão", () => {
    const rule = instagramCommentAutomationSchema.parse({
      id: "ig-01",
      name: "Lead Magnet E-book",
      keywords: ["eu quero", "ebook", "link"],
    });

    expect(rule.isActive).toBe(true);
    expect(rule.postScope).toBe("all_posts");
    expect(rule.autoLikeComment).toBe(true);
    expect(rule.sendPublicReply).toBe(true);
    expect(rule.sendPrivateDm).toBe(true);
    expect(rule.publicReplyVariations.length).toBeGreaterThan(0);
  });

  it("testa correspondência por contains_any", () => {
    const rule = {
      matchType: "contains_any" as const,
      keywords: ["quero", "preco", "preço"],
    };

    expect(matchesCommentRule("Olá, eu quero saber mais!", rule)).toBe(true);
    expect(matchesCommentRule("Qual o preço?", rule)).toBe(true);
    expect(matchesCommentRule("Adorei a foto!", rule)).toBe(false);
  });

  it("testa correspondência exata", () => {
    const rule = {
      matchType: "exact_match" as const,
      keywords: ["promo", "vip"],
    };

    expect(matchesCommentRule("PROMO", rule)).toBe(true);
    expect(matchesCommentRule("vip", rule)).toBe(true);
    expect(matchesCommentRule("promo por favor", rule)).toBe(false);
  });

  it("testa correspondência regex", () => {
    const rule = {
      matchType: "regex" as const,
      keywords: ["^quer[oa]$", "\\bcupom\\d+\\b"],
    };

    expect(matchesCommentRule("quero", rule)).toBe(true);
    expect(matchesCommentRule("quera", rule)).toBe(true);
    expect(matchesCommentRule("cupom10", rule)).toBe(true);
    expect(matchesCommentRule("tenho interesse", rule)).toBe(false);
  });

  it("seleciona variação de resposta pública de forma segura", () => {
    const variations = ["Mensagem 1", "Mensagem 2", "Mensagem 3"];
    const picked = pickPublicReply(variations);
    expect(variations).toContain(picked);
    expect(pickPublicReply([])).toBe("");
  });
});
