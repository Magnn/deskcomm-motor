import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O WHATSAPP OFICIAL CONECTA PELO LOGIN DO FACEBOOK — a segunda entrada do
 * `POST /api/v1/channels/official`.
 *
 * O que este arquivo guarda é a ORDEM, que é onde a entrada nova pode fazer
 * estrago: o token usado para validar e gravar é o trocado no servidor (nunca um
 * valor do navegador); a recusa do plano vem antes de qualquer efeito na Meta; e
 * número que a Meta não ativou não vira canal gravado.
 */

const ORG = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  app: null as { appId: string; appSecret: string; configId: string } | null,
  credencial: vi.fn(),
  registrar: vi.fn(),
  validar: vi.fn(),
  trava: vi.fn(),
  webhook: vi.fn(),
  inseridas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "u1", idioma: "pt-BR", is_platform_admin: false },
    org: { orgId: ORG, role: "admin" },
  }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/planos/trava-de-numero", () => ({ travaDeNovoNumero: h.trava }));
vi.mock("@/lib/channels/meta/validate-credentials", () => ({ validateMetaCredentials: h.validar }));
vi.mock("@/lib/channels/meta/webhook-da-sessao", () => ({
  COLUNAS_DO_DESFECHO_DO_WEBHOOK: "meta_webhook_override_uri",
  registrarWebhookDaSessao: h.webhook,
}));
vi.mock("@/lib/channels/meta/cadastro-incorporado", () => ({
  appDoCadastroIncorporado: async () => h.app,
  credencialDoCadastroIncorporado: h.credencial,
  garantirNumeroRegistrado: h.registrar,
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: async (_admin: unknown, claro: string) => `cifra(${claro})`,
  decryptWebhookSecret: async () => null,
}));
vi.mock("@/lib/supabase/admin", () => {
  // Org sem canal oficial: toda leitura devolve vazio, e o insert é registrado.
  const leitura = {
    select: () => leitura,
    eq: () => leitura,
    is: () => leitura,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    createAdminClient: () => ({
      from: () => ({
        ...leitura,
        insert: (linha: Record<string, unknown>) => {
          h.inseridas.push(linha);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "canal-novo", webhook_path_token: "tok-do-canal" }, error: null }),
            }),
          };
        },
      }),
    }),
  };
});

const post = async (corpo: unknown) => {
  const { POST } = await import("@/app/api/v1/channels/official/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/official", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
};

const peloLogin = { code: "codigo-da-janela-do-facebook", phone_number_id: "1103328999528818", waba_id: "2434045433735175" };

beforeEach(() => {
  vi.clearAllMocks();
  h.inseridas.length = 0;
  h.app = { appId: "app1", appSecret: "seg", configId: "cfg1" };
  h.credencial.mockResolvedValue({
    ok: true,
    token: "token-trocado-no-servidor",
    phoneNumberId: "1103328999528818",
    wabaId: "2434045433735175",
  });
  h.registrar.mockResolvedValue({ ok: true, registrou: true });
  h.validar.mockResolvedValue({ ok: true, displayPhoneNumber: "55 31 99999-8888", verifiedName: "Loja" });
  h.trava.mockResolvedValue(null);
  h.webhook.mockResolvedValue({ registrado: true, url: "https://x/webhook", erro: null, em: "2026-10-07T00:00:00Z" });
});

describe("POST /api/v1/channels/official — pelo login do Facebook", () => {
  it("⭐ o código vira canal: valida, registra o número, grava e registra o webhook com o token trocado", async () => {
    const res = await post(peloLogin);

    expect(res.status).toBe(200);
    expect(h.credencial).toHaveBeenCalledWith(
      expect.objectContaining({ code: peloLogin.code, phoneNumberId: peloLogin.phone_number_id, wabaId: peloLogin.waba_id }),
    );
    expect(h.validar).toHaveBeenCalledWith({
      phoneNumberId: "1103328999528818",
      token: "token-trocado-no-servidor",
      wabaId: "2434045433735175",
    });
    expect(h.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: "1103328999528818", token: "token-trocado-no-servidor" }),
    );
    expect(h.inseridas).toHaveLength(1);
    expect(h.inseridas[0]).toMatchObject({
      organization_id: ORG,
      meta_phone_number_id: "1103328999528818",
      meta_waba_id: "2434045433735175",
      meta_token_encrypted: "cifra(token-trocado-no-servidor)",
      phone_number: "+5531999998888",
      status: "WORKING",
    });
    expect(h.webhook).toHaveBeenCalledWith(expect.objectContaining({ channelSessionId: "canal-novo", wabaId: "2434045433735175" }));
    const corpo = (await res.json()) as { data: { webhookRegistro: { registrado: boolean } } };
    expect(corpo.data.webhookRegistro.registrado).toBe(true);
  });

  it("a conta e o número valem os que saíram da troca, não os do navegador", async () => {
    h.credencial.mockResolvedValue({ ok: true, token: "token-trocado-no-servidor", phoneNumberId: "num-do-token", wabaId: "waba-do-token" });

    await post({ code: peloLogin.code });

    expect(h.validar).toHaveBeenCalledWith(expect.objectContaining({ phoneNumberId: "num-do-token", wabaId: "waba-do-token" }));
    expect(h.inseridas[0]).toMatchObject({ meta_phone_number_id: "num-do-token", meta_waba_id: "waba-do-token" });
  });

  it("instalação sem o login configurado: recusa, sem trocar código nem gravar", async () => {
    h.app = null;

    const res = await post(peloLogin);

    expect(res.status).toBe(422);
    expect(h.credencial).not.toHaveBeenCalled();
    expect(h.inseridas).toHaveLength(0);
  });

  it("token que vence: recusa com a frase de quem conserta, e nada é validado nem gravado", async () => {
    h.credencial.mockResolvedValue({ ok: false, falha: "token_expira", detalhe: null });

    const res = await post(peloLogin);

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("que não expira");
    expect(h.validar).not.toHaveBeenCalled();
    expect(h.inseridas).toHaveLength(0);
  });

  it("⭐ plano que não comporta outro número recusa ANTES de registrar o número na Meta", async () => {
    h.trava.mockResolvedValue(NextResponse.json({ error: { code: "plan_limit" } }, { status: 402 }));

    const res = await post(peloLogin);

    expect(res.status).toBe(402);
    expect(h.registrar).not.toHaveBeenCalled();
    expect(h.inseridas).toHaveLength(0);
  });

  it("número que a Meta não ativou não vira canal: 422 com o motivo, e nada gravado", async () => {
    h.registrar.mockResolvedValue({ ok: false, motivo: "Two step verification PIN mismatch" });

    const res = await post(peloLogin);

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("Two step verification PIN mismatch");
    expect(h.inseridas).toHaveLength(0);
    expect(h.webhook).not.toHaveBeenCalled();
  });

  it("o formulário colado segue como era: não troca código e não registra número", async () => {
    const res = await post({
      phone_number_id: "1103328999528818",
      waba_id: "2434045433735175",
      token: "EAA-token-colado-com-mais-de-vinte-caracteres",
    });

    expect(res.status).toBe(200);
    expect(h.credencial).not.toHaveBeenCalled();
    expect(h.registrar).not.toHaveBeenCalled();
    expect(h.inseridas[0]).toMatchObject({ meta_token_encrypted: "cifra(EAA-token-colado-com-mais-de-vinte-caracteres)" });
  });
});

describe("GET /api/v1/channels/official — o que o botão precisa", () => {
  const get = async () => {
    const { GET } = await import("@/app/api/v1/channels/official/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/channels/official"));
    return ((await res.json()) as { data: { login: unknown } }).data.login;
  };

  it("login configurado: devolve o id do app e o da configuração, e nenhum segredo", async () => {
    const login = await get();
    expect(login).toMatchObject({ appId: "app1", configId: "cfg1" });
    expect(JSON.stringify(login)).not.toContain("seg");
  });

  it("sem configuração: `login` é nulo, e a tela fica com o formulário", async () => {
    h.app = null;
    expect(await get()).toBeNull();
  });
});
