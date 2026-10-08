import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O ENDEREÇO DO APP É REGISTRADO NA META PELO SERVIDOR.
 *
 * O que este arquivo guarda: o token de verificação vai do cofre direto para a
 * Meta — nunca na URL, nunca na resposta da action —, e a lista de campos é a
 * que o produto trata (o pedido substitui a assinatura inteira, então campo que
 * faltar aqui deixa de ser entregue).
 */

const h = vi.hoisted(() => ({
  env: { META_APP_ID: "app1", NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test/" } as Record<string, string>,
  app: { appSecret: "segredo-do-app", verifyToken: "token-de-verificacao" } as { appSecret: string | null; verifyToken: string | null },
  audit: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/channels/meta/app", () => ({ appDaMeta: async () => h.app }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

let pedidos: { url: string; corpo: URLSearchParams }[] = [];
let resposta: () => Response;

beforeEach(() => {
  vi.clearAllMocks();
  pedidos = [];
  h.env.META_APP_ID = "app1";
  h.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo.test/";
  h.app = { appSecret: "segredo-do-app", verifyToken: "token-de-verificacao" };
  resposta = () => new Response(JSON.stringify({ success: true }), { status: 200 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
      pedidos.push({ url: String(entrada), corpo: init?.body as URLSearchParams });
      return resposta();
    }),
  );
});

const registrar = async () => (await import("@/app/actions/settings/registrarWebhookDoAppDaMeta")).registrarWebhookDoAppDaMeta();

describe("registrar o endereço do app na Meta", () => {
  it("⭐ registra o endereço sem token desta instalação, com os campos que o produto trata", async () => {
    const r = await registrar();

    expect(r).toEqual({ ok: true, url: "https://crm.exemplo.test/api/v1/webhooks/meta" });
    expect(pedidos).toHaveLength(1);
    expect(new URL(pedidos[0]!.url).pathname).toMatch(/\/app1\/subscriptions$/);
    const corpo = pedidos[0]!.corpo;
    expect(corpo.get("object")).toBe("whatsapp_business_account");
    expect(corpo.get("callback_url")).toBe("https://crm.exemplo.test/api/v1/webhooks/meta");
    expect(corpo.get("fields")).toBe("messages,message_template_status_update,smb_message_echoes");
  });

  it("token e segredo vão no corpo — nunca na URL nem na resposta", async () => {
    const r = await registrar();

    expect(pedidos[0]!.url).not.toContain("token-de-verificacao");
    expect(pedidos[0]!.url).not.toContain("segredo-do-app");
    expect(pedidos[0]!.corpo.get("verify_token")).toBe("token-de-verificacao");
    expect(JSON.stringify(r)).not.toContain("token-de-verificacao");
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain("token-de-verificacao");
  });

  it("registro feito deixa trilha com o endereço", async () => {
    await registrar();
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform_meta_app.webhook_registered",
        metadata: { url: "https://crm.exemplo.test/api/v1/webhooks/meta" },
      }),
    );
  });

  it("a Meta recusou: devolve o motivo dela, e não há trilha de registro", async () => {
    resposta = () =>
      new Response(JSON.stringify({ error: { message: "(#2200) Callback verification failed" } }), { status: 400 });

    expect(await registrar()).toEqual({
      ok: false,
      error: "recusado_pela_meta",
      motivo: "(#2200) Callback verification failed",
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each([
    ["sem o ID do app", () => (h.env.META_APP_ID = ""), "sem_app_id"],
    ["sem a credencial", () => (h.app = { appSecret: "segredo-do-app", verifyToken: null }), "sem_credencial"],
    ["sem endereço HTTPS", () => (h.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"), "sem_endereco_publico"],
  ])("%s: recusa antes de falar com a Meta", async (_nome, preparar, erro) => {
    preparar();

    expect(await registrar()).toEqual({ ok: false, error: erro });
    expect(pedidos).toHaveLength(0);
  });
});
