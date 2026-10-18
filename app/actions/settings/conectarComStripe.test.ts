import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Stripe from "@/lib/pagamentos/stripe";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  org: vi.fn(),
  mfa: vi.fn(),
  support: vi.fn(),
  criar: vi.fn(),
  link: vi.fn(),
  aviso: vi.fn(),
  audit: vi.fn(),
  upsert: vi.fn(),
  revalidate: vi.fn(),
  erroDeLeitura: false,
  atual: null as null | {
    id: string;
    enabled: boolean;
    stripe_account_id: string;
    stripe_connect_webhook_secret_encrypted: string;
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "outro.test", "x-forwarded-host": "outro.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: mocks.auth,
  resolveActiveOrg: mocks.org,
  mfaEmDivida: mocks.mfa,
}));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: mocks.support }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/planos/stripe-dos-planos", () => ({
  configuracaoDaStripeDosPlanos: () => ({ chave: "sk_plataforma" }),
}));
vi.mock("@/lib/pagamentos/stripe-connect", () => ({
  criarStripeConnect: () => ({ criarConta: mocks.criar, linkDeCadastro: mocks.link }),
}));
vi.mock("@/lib/pagamentos/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof Stripe>()),
  criarAvisoDaPlataforma: mocks.aviso,
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: async () => "cifrado",
  decryptWebhookSecret: async () => "whsec",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      let gravando = false;
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        limit: () => query,
        upsert: (valores: unknown, opts: unknown) => {
          gravando = true;
          mocks.upsert(valores, opts);
          return query;
        },
        single: async () => ({ data: { id: "con-1" }, error: null }),
        maybeSingle: async () => ({
          data:
            tabela === "organizations"
              ? { display_name: "Loja" }
              : gravando
                ? { id: "con-1" }
                : mocks.atual,
          error: mocks.erroDeLeitura ? { message: "indisponível" } : null,
        }),
      };
      return query;
    },
  }),
}));

import { conectarComStripe } from "./conectarComStripe";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.atual = null;
  mocks.erroDeLeitura = false;
  mocks.auth.mockResolvedValue({
    id: "u-1",
    email: "admin@example.test",
    is_platform_admin: false,
  });
  mocks.org.mockResolvedValue({ orgId: "org-1", role: "admin" });
  mocks.mfa.mockResolvedValue(false);
  mocks.support.mockReturnValue(null);
  mocks.criar.mockResolvedValue({ id: "acct_empresa" });
  mocks.link.mockResolvedValue("https://connect.stripe.com/setup/teste");
  mocks.aviso.mockResolvedValue({ id: "we_1", segredo: "whsec" });
});

describe("cadastro da conta conectada", () => {
  it.each(["agent", "manager", "viewer"])(
    "papel %s não cria conta nem grava conexão",
    async (role) => {
      mocks.org.mockResolvedValue({ orgId: "org-1", role });
      expect(await conectarComStripe()).toEqual({ ok: false, error: "forbidden_role" });
      expect(mocks.criar).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );

  it("MFA devido impede o efeito", async () => {
    mocks.mfa.mockResolvedValue(true);
    expect(await conectarComStripe()).toEqual({ ok: false, error: "mfa_required" });
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("erro ao ler a conexão não cria outra conta", async () => {
    mocks.erroDeLeitura = true;
    expect(await conectarComStripe()).toEqual({ ok: false, error: "erro_ao_gravar" });
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("primeira conexão grava conta e segredo cifrado e audita sem segredos", async () => {
    expect(await conectarComStripe()).toEqual({
      ok: true,
      url: "https://connect.stripe.com/setup/teste",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        enabled: true,
        stripe_account_id: "acct_empresa",
        stripe_connect_webhook_secret_encrypted: "cifrado",
      }),
      { onConflict: "organization_id,provider" },
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        action: "payment_gateway_connection.updated",
      }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("whsec");
    expect(mocks.aviso).toHaveBeenCalledWith(expect.anything(), "https://app.test/api/v1/webhooks/stripe-connect");
  });

  it("sessão de suporte impedida não cria conta", async () => {
    mocks.support.mockReturnValue("forbidden");
    expect(await conectarComStripe()).toEqual({ ok: false, error: "forbidden_role" });
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("continuar cadastro reutiliza a conta e mantém a pausa", async () => {
    mocks.atual = {
      id: "con-1",
      enabled: false,
      stripe_account_id: "acct_empresa",
      stripe_connect_webhook_secret_encrypted: "cifrado",
    };
    expect((await conectarComStripe()).ok).toBe(true);
    expect(mocks.criar).not.toHaveBeenCalled();
    expect(mocks.aviso).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.anything(),
    );
  });
});
