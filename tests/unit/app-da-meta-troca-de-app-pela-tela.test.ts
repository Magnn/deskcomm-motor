import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TROCAR O APP DA META PELA TELA (migration 0927).
 *
 * O portfólio dono do app foi restrito pela Meta ("não pode mais integrar
 * clientes") e o botão "Conectar com Facebook" ficou preso a ele: o ID do app e
 * a configuração do login moravam só no `.env`. Este arquivo prende:
 *
 * 1. App novo exige a chave DELE no mesmo save — a guardada é do antigo.
 * 2. O par (ID, chave) é conferido na Meta antes de gravar, e o token de app vai
 *    no CORPO, nunca na URL.
 * 3. Trocar de app limpa as configurações de login que não vieram junto: a do
 *    app antigo não abre a janela do novo.
 * 4. O resolvedor usa os ids do banco quando há `app_id` gravado, e o `.env`
 *    quando não há — instalação que não mexeu em nada não muda.
 *
 * Sabotagem: tirar o `app_novo_sem_chave` deixa o ⭐ vermelho; tirar o
 * `valores[c] = null` do ramo `trocaDeApp` deixa o 🧹 vermelho.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const SEGREDO_NOVO = "fedcba9876543210fedcba9876543210";
const ORIGINAL = { ...process.env };

let linha: Record<string, string | null> | null = null;
const gravacoes: Record<string, unknown>[] = [];
let pedidos: { url: string; corpo: string }[] = [];
let respostaDaMeta: () => Response;

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdmin: async () => ({ user: { id: USUARIO } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }),
      upsert: async (valores: Record<string, unknown>) => {
        gravacoes.push(valores);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: async (_a: unknown, v: string) => `cifra(${v})`,
  decryptWebhookSecret: async (_a: unknown, v: string) => v.replace(/^cifra\((.*)\)$/, "$1"),
}));
const audit = vi.fn(async (_e: unknown) => undefined);
vi.mock("@/lib/audit", () => ({ audit: (e: unknown) => audit(e) }));

beforeEach(() => {
  linha = {
    app_secret_encrypted: "cifra(segredo-antigo)",
    verify_token_encrypted: "cifra(token)",
    app_id: "1111111111",
    whatsapp_config_id: "2222222222",
    messenger_config_id: "3333333333",
    ads_config_id: null,
  };
  gravacoes.length = 0;
  pedidos = [];
  audit.mockClear();
  respostaDaMeta = () => new Response(JSON.stringify({ id: "9999999999", name: "App do portfólio novo" }), { status: 200 });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    pedidos.push({ url, corpo: String(init.body) });
    return respostaDaMeta();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL };
});

async function acoes() {
  return import("@/app/actions/settings/updateMetaApp");
}

describe("updateMetaApp — trocar de app", () => {
  it("⭐ ID novo sem a chave do app novo é recusado, sem falar com a Meta nem gravar", async () => {
    const { updateMetaApp } = await acoes();

    expect(await updateMetaApp({ app_id: "9999999999" })).toEqual({ ok: false, error: "app_novo_sem_chave" });
    expect(pedidos).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("par que a Meta não reconhece é recusado, e nada é gravado", async () => {
    respostaDaMeta = () =>
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token signature." } }), { status: 400 });
    const { updateMetaApp } = await acoes();

    const r = await updateMetaApp({ app_id: "9999999999", app_secret: SEGREDO_NOVO });

    expect(r).toMatchObject({ ok: false, error: "app_recusado_pela_meta" });
    expect(gravacoes).toEqual([]);
  });

  it("🧹 par conferido grava ID + chave, devolve o nome e limpa as configurações do app antigo", async () => {
    const { updateMetaApp } = await acoes();

    const r = await updateMetaApp({ app_id: "9999999999", app_secret: SEGREDO_NOVO, whatsapp_config_id: "5555555555" });

    expect(r).toEqual({ ok: true, appName: "App do portfólio novo" });
    expect(gravacoes[0]).toMatchObject({
      app_id: "9999999999",
      app_secret_encrypted: `cifra(${SEGREDO_NOVO})`,
      whatsapp_config_id: "5555555555",
      messenger_config_id: null,
      ads_config_id: null,
    });
    // O token de verificação é NOSSO, não do app: trocar de app não o regera.
    expect(gravacoes[0]).not.toHaveProperty("verify_token_encrypted");
  });

  it("o token de app vai no corpo — nunca na URL — e a trilha não leva a chave", async () => {
    const { updateMetaApp } = await acoes();

    await updateMetaApp({ app_id: "9999999999", app_secret: SEGREDO_NOVO });

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.url).not.toContain(SEGREDO_NOVO);
    expect(pedidos[0]!.corpo).toContain("access_token=9999999999%7C" + SEGREDO_NOVO);
    const trilha = JSON.stringify(audit.mock.calls);
    expect(trilha).not.toContain(SEGREDO_NOVO);
    expect(trilha).toContain("1111111111");
    expect(trilha).toContain("9999999999");
  });

  it("mesmo app: trocar só a configuração do WhatsApp não pede a chave nem fala com a Meta", async () => {
    const { updateMetaApp } = await acoes();

    const r = await updateMetaApp({ app_id: "1111111111", whatsapp_config_id: "7777777777" });

    expect(r).toEqual({ ok: true });
    expect(pedidos).toEqual([]);
    expect(gravacoes[0]).toMatchObject({ whatsapp_config_id: "7777777777" });
    expect(gravacoes[0]).not.toHaveProperty("messenger_config_id");
  });

  it("configuração vazia apaga", async () => {
    const { updateMetaApp } = await acoes();

    await updateMetaApp({ messenger_config_id: "" });

    expect(gravacoes[0]).toMatchObject({ messenger_config_id: null });
  });
});

describe("appDaMeta — os ids andam com a chave", () => {
  async function resolvedor() {
    vi.resetModules();
    const mod = await import("@/lib/channels/meta/app");
    mod.invalidarAppDaMeta();
    return mod;
  }

  it("com app_id no banco, ID e configurações vêm do banco — as do .env são de outro app", async () => {
    process.env.META_APP_ID = "1431224221868157";
    process.env.META_WHATSAPP_CONFIG_ID = "1005172168648588";
    process.env.META_MESSENGER_CONFIG_ID = "4444444444";
    const { appDaMeta, idsDoAppDaMeta } = await resolvedor();

    const app = await appDaMeta();

    expect(app).toMatchObject({
      appId: "1111111111",
      appSecret: "segredo-antigo",
      whatsappConfigId: "2222222222",
      messengerConfigId: "3333333333",
      adsConfigId: null,
    });
    expect(await idsDoAppDaMeta()).toEqual({
      appId: "1111111111",
      whatsappConfigId: "2222222222",
      messengerConfigId: "3333333333",
      adsConfigId: null,
    });
  });

  it("sem app_id no banco, os ids continuam vindo do .env — quem não mexeu não muda", async () => {
    linha = { app_secret_encrypted: "cifra(segredo-antigo)", verify_token_encrypted: "cifra(token)", app_id: null };
    process.env.META_APP_ID = "1431224221868157";
    process.env.META_WHATSAPP_CONFIG_ID = "1005172168648588";
    const { appDaMeta } = await resolvedor();

    expect(await appDaMeta()).toMatchObject({
      appId: "1431224221868157",
      appSecret: "segredo-antigo",
      whatsappConfigId: "1005172168648588",
    });
  });
});
