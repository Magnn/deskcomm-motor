import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ORGANIZAÇÃO CONECTA PELO APP DELA (migration 0967).
 *
 * Cada BM com o seu app: a 0933 e o #582 já aceitam os avisos e renovam os
 * tokens de vários apps, mas o "Conectar" abria SEMPRE pelo principal — a janela
 * da Meta mostrava o nome do app principal, e a análise do app da BM exige o
 * nome dela. `appDaMetaDaOrg` resolve qual app abre a janela de cada organização.
 *
 * Propriedades presas aqui:
 *  1. sem escolha → o principal, idêntico ao que era;
 *  2. com escolha → id, chave e configurações DO APP ESCOLHIDO, e o verify
 *     token do principal (o handshake do webhook confere um só);
 *  3. qualquer falha (tabela ausente num rollback, chave que não decifra) →
 *     o principal, sem lançar: quem chama é um clique de "Conectar".
 */

const ORIGINAL = { ...process.env };

type Linha = Record<string, unknown>;
let principal: Linha | null;
let escolha: Linha | null;
let erroDaEscolha: { code: string } | null;
let anteriores: Linha[];
let consultasDaEscolha = 0;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => {
        const lista = async () => ({ data: tabela === "platform_meta_apps_anteriores" ? anteriores : [], error: null });
        return {
          then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => lista().then(ok, falha),
          eq: (_coluna: string, valor: unknown) => ({
            maybeSingle: async () => {
              if (tabela === "platform_meta_app") return { data: principal, error: null };
              if (tabela === "platform_meta_app_da_org") {
                consultasDaEscolha += 1;
                return { data: erroDaEscolha ? null : escolha, error: erroDaEscolha };
              }
              if (tabela === "platform_meta_apps_anteriores") {
                return { data: anteriores.find((l) => l.app_id === valor) ?? null, error: null };
              }
              return { data: null, error: null };
            },
          }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async (_admin: unknown, cifrado: string) => (cifrado.startsWith("cifra:") ? cifrado.slice(6) : null),
}));

async function modulo() {
  vi.resetModules();
  delete process.env.META_APP_SECRET;
  delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  delete process.env.META_APP_ID;
  const mod = await import("@/lib/channels/meta/app");
  mod.invalidarAppDaMeta();
  return mod;
}

beforeEach(() => {
  principal = {
    app_secret_encrypted: "cifra:segredo-principal",
    verify_token_encrypted: "cifra:token-principal",
    app_id: "1111111111",
    whatsapp_config_id: "901",
    messenger_config_id: "902",
    ads_config_id: "903",
  };
  escolha = null;
  erroDaEscolha = null;
  anteriores = [
    {
      app_id: "2222222222",
      app_secret_encrypted: "cifra:segredo-da-bm",
      whatsapp_config_id: "801",
      messenger_config_id: "802",
      ads_config_id: null,
    },
  ];
  consultasDaEscolha = 0;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("appDaMetaDaOrg", () => {
  it("organização sem escolha conecta pelo principal", async () => {
    const { appDaMetaDaOrg } = await modulo();
    const app = await appDaMetaDaOrg("org-a");
    expect(app).toMatchObject({ appId: "1111111111", appSecret: "segredo-principal", whatsappConfigId: "901", messengerConfigId: "902" });
  });

  it("organização com app escolhido conecta pelo app dela, com o verify token do principal", async () => {
    escolha = { app_id: "2222222222" };
    const { appDaMetaDaOrg } = await modulo();
    expect(await appDaMetaDaOrg("org-b")).toEqual({
      appId: "2222222222",
      appSecret: "segredo-da-bm",
      verifyToken: "token-principal",
      whatsappConfigId: "801",
      messengerConfigId: "802",
      adsConfigId: null,
    });
  });

  it("app escolhido cuja chave não decifra: volta o principal", async () => {
    escolha = { app_id: "2222222222" };
    anteriores = [{ ...anteriores[0], app_secret_encrypted: "lixo" }];
    const { appDaMetaDaOrg } = await modulo();
    expect((await appDaMetaDaOrg("org-b")).appId).toBe("1111111111");
  });

  it("banco sem a 0967 (rollback): volta o principal sem lançar", async () => {
    erroDaEscolha = { code: "42P01" };
    const { appDaMetaDaOrg } = await modulo();
    expect((await appDaMetaDaOrg("org-b")).appId).toBe("1111111111");
  });

  it("sem organização (o handshake) nem consulta a escolha", async () => {
    escolha = { app_id: "2222222222" };
    const { appDaMetaDaOrg } = await modulo();
    expect((await appDaMetaDaOrg(null)).appId).toBe("1111111111");
    expect(consultasDaEscolha).toBe(0);
  });
});
