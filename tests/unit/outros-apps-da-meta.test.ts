import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VÁRIOS APPS DA META NA MESMA INSTALAÇÃO.
 *
 * Cada BM tem o seu app, e a Meta assina o aviso de cada número com a chave do
 * app pelo qual ele entrou. Este arquivo prende:
 *
 * 1. Conectar um app ao lado: confere o par na Meta, grava cifrado na lista que
 *    a conferência de assinatura já lê, e aponta o webhook do app para cá.
 * 2. O principal não entra na lista (a troca futura apagaria a chave errada).
 * 3. Desconectar app com número ativo é recusado — o número ficaria mudo.
 * 4. Número colado leva o app do PRÓPRIO token; token de app desconhecido é
 *    recusado com 422 em vez de virar número mudo.
 *
 * Sabotagem: tirar o `if (principal.appId === appId)` deixa o 🅿️ vermelho;
 * trocar `metaAppId = doToken.id` por nada deixa o ⭐ da rota vermelho; tirar o
 * ramo `else if (principal)` deixa o 🚫 vermelho.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const USUARIO = "11111111-1111-4111-8111-111111111111";
const SEGREDO = "fedcba9876543210fedcba9876543210";

const h = vi.hoisted(() => ({
  principal: { appId: "1111111111" as string | null, appSecret: "seg", verifyToken: "vt" as string | null },
  outros: [] as string[],
  par: vi.fn(),
  ativar: vi.fn(),
  doToken: vi.fn(),
  validar: vi.fn(),
  upserts: [] as { tabela: string; valores: Record<string, unknown> }[],
  deletes: [] as { tabela: string; filtros: [string, unknown][] }[],
  inseridas: [] as Record<string, unknown>[],
  contagem: 0,
  invalidar: vi.fn(),
}));

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: async () => ({ user: { id: USUARIO } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/env", async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...real.env, NEXT_PUBLIC_APP_URL: "https://desk.exemplo.test" } };
});
vi.mock("@/lib/channels/meta/app", async (orig) => ({
  ...((await orig()) as object),
  appDaMeta: async () => ({ ...h.principal }),
  conferirParDoAppNaMeta: h.par,
  invalidarAppDaMeta: h.invalidar,
  appDoToken: h.doToken,
  idsDosAppsDaInstalacao: async () => ({ principal: h.principal.appId, outros: h.outros }),
  numerosAtivosPorApp: async (_a: unknown, ids: string[]) => new Map(ids.map((id) => [id, h.contagem])),
}));
vi.mock("@/lib/channels/meta/ativar-app", async (orig) => ({
  ...((await orig()) as object),
  ativarTudoNoAppDaMeta: h.ativar,
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: async (_a: unknown, v: string) => `cifra(${v})`,
  decryptWebhookSecret: async () => null,
}));
const audit = vi.fn(async (_e: unknown) => undefined);
vi.mock("@/lib/audit", () => ({ audit: (e: unknown) => audit(e) }));

// Rota do canal oficial: o resto do caminho, sem efeito.
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "u1", idioma: "pt-BR", is_platform_admin: false },
    org: { orgId: ORG, role: "admin" },
  }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/planos/trava-de-numero", () => ({ travaDeNovoNumero: async () => null }));
vi.mock("@/lib/channels/meta/validate-credentials", () => ({ validateMetaCredentials: h.validar }));
vi.mock("@/lib/channels/meta/webhook-da-sessao", () => ({
  COLUNAS_DO_DESFECHO_DO_WEBHOOK: "meta_webhook_override_uri",
  registrarWebhookDaSessao: async () => ({ registrado: true, url: "https://x", erro: null, em: "2026-11-22T00:00:00Z" }),
}));
vi.mock("@/lib/channels/meta/cadastro-incorporado", () => ({
  appDoCadastroIncorporado: async () => null,
  credencialDoCadastroIncorporado: vi.fn(),
  garantirNumeroRegistrado: async () => ({ ok: true, registrou: false }),
}));

vi.mock("@/lib/supabase/admin", () => {
  const leitura: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => (o?.head ? contagem : leitura),
    eq: () => leitura,
    is: () => leitura,
    in: () => leitura,
    order: () => leitura,
    limit: () => leitura,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok, erro),
  };
  const contagem: Record<string, unknown> = {
    eq: () => contagem,
    is: () => contagem,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: h.contagem, error: null }).then(ok),
  };
  return {
    createAdminClient: () => ({
      rpc: async () => ({ data: null, error: null }),
      from: (tabela: string) => ({
        ...leitura,
        upsert: async (valores: Record<string, unknown>) => {
          h.upserts.push({ tabela, valores });
          return { error: null };
        },
        delete: () => {
          const r = { tabela, filtros: [] as [string, unknown][] };
          h.deletes.push(r);
          const c = {
            eq: (col: string, v: unknown) => {
              r.filtros.push([col, v]);
              return Promise.resolve({ error: null });
            },
          };
          return c;
        },
        insert: (linha: Record<string, unknown>) => {
          h.inseridas.push(linha);
          return {
            select: () => ({ maybeSingle: async () => ({ data: { id: "canal-novo", webhook_path_token: "tok" }, error: null }) }),
          };
        },
      }),
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  h.principal = { appId: "1111111111", appSecret: "seg", verifyToken: "vt" };
  h.outros = [];
  h.upserts.length = 0;
  h.deletes.length = 0;
  h.inseridas.length = 0;
  h.contagem = 0;
  h.par.mockResolvedValue({ ok: true, nome: "App da BM nova" });
  h.ativar.mockResolvedValue([{ chave: "webhook_whatsapp", ok: true, motivo: null }]);
  h.validar.mockResolvedValue({ ok: true, displayPhoneNumber: "55 31 99999-8888", verifiedName: "Loja" });
  h.doToken.mockResolvedValue(null);
});

const acoes = () => import("@/app/actions/settings/outrosAppsDaMeta");

describe("conectarOutroAppDaMeta", () => {
  it("⭐ confere o par, grava cifrado na lista lida pela assinatura e aponta o webhook do app para cá", async () => {
    const { conectarOutroAppDaMeta } = await acoes();

    const r = await conectarOutroAppDaMeta({ app_id: "5555555555", app_secret: SEGREDO });

    expect(r).toMatchObject({ ok: true, nome: "App da BM nova" });
    expect(h.par).toHaveBeenCalledWith("5555555555", SEGREDO);
    expect(h.upserts).toEqual([
      {
        tabela: "platform_meta_apps_anteriores",
        valores: expect.objectContaining({ app_id: "5555555555", app_secret_encrypted: `cifra(${SEGREDO})` }),
      },
    ]);
    expect(h.invalidar).toHaveBeenCalled();
    expect(h.ativar).toHaveBeenCalledWith({
      appId: "5555555555",
      appSecret: SEGREDO,
      verifyToken: "vt",
      base: "https://desk.exemplo.test",
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform_meta_app.outro_app_conectado" }));
  });

  it("🅿️ o app principal não entra na lista", async () => {
    const { conectarOutroAppDaMeta } = await acoes();

    expect(await conectarOutroAppDaMeta({ app_id: "1111111111", app_secret: SEGREDO })).toEqual({ ok: false, error: "e_o_principal" });
    expect(h.upserts).toEqual([]);
  });

  it("par recusado pela Meta não grava nem ativa", async () => {
    h.par.mockResolvedValue({ ok: false, motivo: "Invalid OAuth access token signature." });
    const { conectarOutroAppDaMeta } = await acoes();

    const r = await conectarOutroAppDaMeta({ app_id: "5555555555", app_secret: SEGREDO });

    expect(r).toMatchObject({ ok: false, error: "app_recusado_pela_meta" });
    expect(h.upserts).toEqual([]);
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("sem token de verificação: grava, mas devolve passos nulos — a tela diz que falta ativar", async () => {
    h.principal.verifyToken = null;
    const { conectarOutroAppDaMeta } = await acoes();

    expect(await conectarOutroAppDaMeta({ app_id: "5555555555", app_secret: SEGREDO })).toMatchObject({ ok: true, passos: null });
    expect(h.ativar).not.toHaveBeenCalled();
  });
});

describe("desconectarOutroAppDaMeta", () => {
  it("recusa enquanto houver número ativo do app", async () => {
    h.contagem = 2;
    const { desconectarOutroAppDaMeta } = await acoes();

    expect(await desconectarOutroAppDaMeta("5555555555")).toEqual({ ok: false, error: "app_com_numeros", numeros: 2 });
    expect(h.deletes).toEqual([]);
  });

  it("sem números, apaga a chave e audita", async () => {
    const { desconectarOutroAppDaMeta } = await acoes();

    expect(await desconectarOutroAppDaMeta("5555555555")).toEqual({ ok: true });
    expect(h.deletes).toEqual([{ tabela: "platform_meta_apps_anteriores", filtros: [["app_id", "5555555555"]] }]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform_meta_app.outro_app_desconectado" }));
  });
});

const colar = async (token = "EAAG-token-colado-pelo-dono-0000") => {
  const { POST } = await import("@/app/api/v1/channels/official/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/official", {
      method: "POST",
      body: JSON.stringify({ phone_number_id: "1414148421790574", waba_id: "1645566610660801", token }),
      headers: { "content-type": "application/json" },
    }),
  );
};

describe("POST /api/v1/channels/official — token colado", () => {
  it("⭐ número colado com token de outro app conectado grava o app dele", async () => {
    h.outros = ["5555555555"];
    h.doToken.mockResolvedValue({ id: "5555555555", nome: "App da BM nova" });

    const res = await colar();

    expect(res.status).toBe(200);
    expect(h.inseridas[0]).toMatchObject({ meta_app_id: "5555555555" });
  });

  it("token do app principal grava o principal", async () => {
    h.doToken.mockResolvedValue({ id: "1111111111", nome: "Principal" });

    await colar();

    expect(h.inseridas[0]).toMatchObject({ meta_app_id: "1111111111" });
  });

  it("🚫 token de app que a instalação não conhece: 422, nada gravado", async () => {
    h.doToken.mockResolvedValue({ id: "7777777777", nome: "App solto" });

    const res = await colar();

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("App solto");
    expect(h.inseridas).toHaveLength(0);
  });

  it("sem resposta sobre o app do token, segue como sempre: app em vigor (nulo)", async () => {
    const res = await colar();

    expect(res.status).toBe(200);
    expect(h.inseridas[0]).toMatchObject({ meta_app_id: null });
  });
});
