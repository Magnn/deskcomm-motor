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

// As regras de comentário do Instagram saíram daqui: o esquema solto deu lugar ao
// módulo de verdade, testado em `lib/channels/instagram/regras.test.ts` e
// `comentarios.test.ts`.
