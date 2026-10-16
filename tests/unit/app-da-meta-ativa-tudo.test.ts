import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SALVAR O APP DA META ATIVA, NA META, TUDO O QUE O PRODUTO USA DELE — e confere.
 *
 * O que este arquivo guarda:
 *  - os três pedidos saem (WhatsApp, páginas, endereços públicos), com os campos
 *    que o produto trata — o pedido substitui a assinatura inteira, então campo
 *    que faltar aqui deixa de ser entregue;
 *  - o quadro da tela é o que a META diz depois (`GET /subscriptions`), não o
 *    que mandamos;
 *  - segredo e token nunca na URL, na resposta nem na trilha;
 *  - um passo recusado não impede os outros.
 */

const h = vi.hoisted(() => ({
  env: { META_APP_ID: "app1", NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test/" } as Record<string, string>,
  app: { appSecret: "segredo-do-app", verifyToken: "token-de-verificacao" } as { appSecret: string | null; verifyToken: string | null },
  audit: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/channels/meta/app", () => ({ appDaMeta: async () => ({ appId: h.env.META_APP_ID || null, ...h.app }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const CAMPOS_WHATSAPP = ["messages", "message_template_status_update", "smb_message_echoes", "smb_app_state_sync", "history", "account_update"];
const CAMPOS_PAGINA = ["messages", "messaging_postbacks", "message_echoes", "message_deliveries", "message_reads", "messaging_referrals"];

type Pedido = { url: string; corpo: URLSearchParams };
let pedidos: Pedido[] = [];
/** O que a Meta tem depois dos pedidos — a conferência lê daqui. */
let naMeta: { assinaturas: unknown[]; app: Record<string, unknown> };
let recusar: (p: Pedido) => string | null;

const assinaturaCompleta = () => [
  { object: "whatsapp_business_account", callback_url: "https://crm.exemplo.test/api/v1/webhooks/meta", active: true, fields: CAMPOS_WHATSAPP.map((name) => ({ name, version: "v22.0" })) },
  { object: "page", callback_url: "https://crm.exemplo.test/api/v1/webhooks/messenger", active: true, fields: CAMPOS_PAGINA.map((name) => ({ name, version: "v22.0" })) },
];

beforeEach(() => {
  vi.clearAllMocks();
  pedidos = [];
  h.env.META_APP_ID = "app1";
  h.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo.test/";
  h.app = { appSecret: "segredo-do-app", verifyToken: "token-de-verificacao" };
  naMeta = {
    assinaturas: assinaturaCompleta(),
    app: { app_domains: ["crm.exemplo.test"], privacy_policy_url: "https://crm.exemplo.test/legal/privacy", terms_of_service_url: "https://crm.exemplo.test/legal/terms" },
  };
  recusar = () => null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
      const p = { url: String(entrada), corpo: init?.body as URLSearchParams };
      pedidos.push(p);
      const erro = recusar(p);
      if (erro) return new Response(JSON.stringify({ error: { message: erro } }), { status: 400 });
      if (p.corpo.get("method") === "GET") {
        const corpo = p.url.endsWith("/subscriptions") ? { data: naMeta.assinaturas } : naMeta.app;
        return new Response(JSON.stringify(corpo), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }),
  );
});

const ativar = async () => (await import("@/app/actions/settings/ativarAppDaMeta")).ativarAppDaMeta();
const escritas = () => pedidos.filter((p) => p.corpo.get("method") !== "GET");

describe("ativar tudo no app da Meta", () => {
  it("⭐ liga WhatsApp, páginas e endereços públicos, e o quadro sai todo verde quando a Meta confirma", async () => {
    const r = await ativar();

    expect(r).toEqual({
      ok: true,
      passos: [
        { chave: "webhook_whatsapp", ok: true, motivo: null },
        { chave: "webhook_paginas", ok: true, motivo: null },
        { chave: "enderecos_do_app", ok: true, motivo: null },
      ],
    });
    const [whatsapp, paginas, enderecos] = escritas();
    expect(new URL(whatsapp!.url).pathname).toMatch(/\/app1\/subscriptions$/);
    expect(whatsapp!.corpo.get("object")).toBe("whatsapp_business_account");
    expect(whatsapp!.corpo.get("callback_url")).toBe("https://crm.exemplo.test/api/v1/webhooks/meta");
    expect(whatsapp!.corpo.get("fields")).toBe(CAMPOS_WHATSAPP.join(","));
    expect(paginas!.corpo.get("object")).toBe("page");
    expect(paginas!.corpo.get("callback_url")).toBe("https://crm.exemplo.test/api/v1/webhooks/messenger");
    expect(paginas!.corpo.get("fields")).toBe(CAMPOS_PAGINA.join(","));
    expect(new URL(enderecos!.url).pathname).toMatch(/\/app1$/);
    expect(JSON.parse(enderecos!.corpo.get("app_domains")!)).toEqual(["crm.exemplo.test"]);
    expect(enderecos!.corpo.get("privacy_policy_url")).toBe("https://crm.exemplo.test/legal/privacy");
    expect(enderecos!.corpo.get("terms_of_service_url")).toBe("https://crm.exemplo.test/legal/terms");
  });

  it("o quadro é o que a Meta diz DEPOIS: aceitou o pedido, mas a assinatura ficou sem um aviso → vermelho com o nome dele", async () => {
    naMeta.assinaturas = assinaturaCompleta().map((a) =>
      a.object === "whatsapp_business_account" ? { ...a, fields: a.fields.filter((f) => f.name !== "history") } : a,
    );

    const r = await ativar();

    expect(r.ok && r.passos[0]).toEqual({ chave: "webhook_whatsapp", ok: false, motivo: "faltam os avisos: history" });
    expect(r.ok && r.passos[1]!.ok).toBe(true);
  });

  it("endereço de outra instalação na Meta aparece como tal", async () => {
    naMeta.assinaturas = assinaturaCompleta().map((a) =>
      a.object === "page" ? { ...a, callback_url: "https://outro.test/api/v1/webhooks/messenger" } : a,
    );

    const r = await ativar();

    expect(r.ok && r.passos[1]!.motivo).toContain("https://outro.test/api/v1/webhooks/messenger");
  });

  it("vale o estado: pedido recusado com a Meta já certa é verde (medido em produção: escrita de configurações desligada no app)", async () => {
    recusar = (p) =>
      p.corpo.has("app_domains") ? "(#10) Changing app settings through API calls has been disabled for this app." : null;

    const r = await ativar();

    expect(r.ok && r.passos[2]).toEqual({ chave: "enderecos_do_app", ok: true, motivo: null });
  });

  it("recusa de configuração por API com algo faltando: diz qual chave ligar no painel", async () => {
    recusar = (p) =>
      p.corpo.has("app_domains") ? "(#10) Changing app settings through API calls has been disabled for this app." : null;
    naMeta.app = {};

    const r = await ativar();

    expect(r.ok && r.passos[2]!.ok).toBe(false);
    expect(r.ok && r.passos[2]!.motivo).toContain("Permitir acesso à API às configurações do app");
  });

  it("um passo recusado pela Meta não impede os outros, e o motivo dela vai para o quadro", async () => {
    recusar = (p) => (p.corpo.get("object") === "page" ? "(#2200) Callback verification failed" : null);
    naMeta.assinaturas = assinaturaCompleta().filter((a) => a.object !== "page");

    const r = await ativar();

    expect(escritas()).toHaveLength(3);
    expect(r.ok && r.passos.map((p) => [p.chave, p.ok, p.motivo])).toEqual([
      ["webhook_whatsapp", true, null],
      ["webhook_paginas", false, "(#2200) Callback verification failed"],
      ["enderecos_do_app", true, null],
    ]);
  });

  it("segredo e token vão no corpo — nunca na URL, na resposta nem na trilha", async () => {
    const r = await ativar();

    for (const p of pedidos) {
      expect(p.url).not.toContain("token-de-verificacao");
      expect(p.url).not.toContain("segredo-do-app");
    }
    expect(JSON.stringify(r)).not.toContain("token-de-verificacao");
    expect(JSON.stringify(r)).not.toContain("segredo-do-app");
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain("token-de-verificacao");
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain("segredo-do-app");
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform_meta_app.activated",
        metadata: {
          app_id: "app1",
          passos: [
            { chave: "webhook_whatsapp", ok: true },
            { chave: "webhook_paginas", ok: true },
            { chave: "enderecos_do_app", ok: true },
          ],
        },
      }),
    );
  });

  it.each([
    ["sem o ID do app", () => (h.env.META_APP_ID = ""), "sem_app_id"],
    ["sem a credencial", () => (h.app = { appSecret: "segredo-do-app", verifyToken: null }), "sem_credencial"],
    ["sem endereço HTTPS", () => (h.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"), "sem_endereco_publico"],
  ])("%s: recusa antes de falar com a Meta", async (_nome, preparar, erro) => {
    preparar();

    expect(await ativar()).toEqual({ ok: false, error: erro });
    expect(pedidos).toHaveLength(0);
  });
});

describe("regras puras da conferência", () => {
  it("endereços: aponta cada coisa que falta", async () => {
    const { faltasDosEnderecos } = await import("@/lib/channels/meta/ativar-app");
    const e = { dominio: "crm.exemplo.test", privacidade: "x", termos: "y" };
    expect(faltasDosEnderecos({}, e)).toBe("faltam: domínio crm.exemplo.test, política de privacidade, termos de serviço");
    expect(faltasDosEnderecos({ app_domains: ["crm.exemplo.test"], privacy_policy_url: "a", terms_of_service_url: "b" }, e)).toBeNull();
  });

  it("assinatura ausente ou desligada é vermelho", async () => {
    const { faltasDaAssinatura } = await import("@/lib/channels/meta/ativar-app");
    expect(faltasDaAssinatura([], "page", "u", ["messages"])).toBe("a Meta não tem este endereço registrado");
    expect(faltasDaAssinatura([{ object: "page", callback_url: "u", active: false, fields: [] }], "page", "u", ["messages"])).toBe(
      "a assinatura está desligada na Meta",
    );
  });
});
