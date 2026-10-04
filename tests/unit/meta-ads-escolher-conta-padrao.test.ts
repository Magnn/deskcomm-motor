import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Escolher a conta padrão SEM trocar o token.
 *
 * Medido em produção em 04/10/2026: a escolha dava "Não consegui gravar agora".
 * A ação fazia `upsert` sem `access_token_encrypted`, e o Postgres valida o NOT
 * NULL da linha a inserir antes de olhar o conflito.
 */
const banco = vi.hoisted(() => ({
  existente: { id: "linha-1" } as { id: string } | null,
  chamadas: [] as { operacao: string; valores: Record<string, unknown> }[],
  tocadas: [{ id: "linha-1" }] as { id: string }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: banco.existente, error: null }) }) }) }),
      update: (valores: Record<string, unknown>) => {
        banco.chamadas.push({ operacao: "update", valores });
        return { eq: () => ({ eq: () => ({ select: async () => ({ data: banco.tocadas, error: null }) }) }) };
      },
      upsert: async (valores: Record<string, unknown>) => {
        banco.chamadas.push({ operacao: "upsert", valores });
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "user-1", is_platform_admin: false, support: null }),
  resolveActiveOrg: async () => ({ orgId: "org-1", role: "admin" }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: async () => "cifrado" }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { updateAdInsightsConnection } from "@/app/actions/settings/updateAdInsightsConnection";

beforeEach(() => {
  banco.existente = { id: "linha-1" };
  banco.chamadas = [];
  banco.tocadas = [{ id: "linha-1" }];
});

describe("escolher a conta padrão do Meta Ads", () => {
  it("com conexão existente e sem token novo, ATUALIZA a linha — não tenta inserir sem token", async () => {
    const r = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: "act_123" });

    expect(r).toEqual({ ok: true });
    expect(banco.chamadas.map((c) => c.operacao)).toEqual(["update"]);
    expect(banco.chamadas[0]?.valores).toMatchObject({ default_account_id: "act_123" });
    expect(banco.chamadas[0]?.valores).not.toHaveProperty("access_token_encrypted");
  });

  it("atualização que não toca linha nenhuma é falha, não 'salvo'", async () => {
    banco.tocadas = [];

    const r = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: "act_123" });

    expect(r).toMatchObject({ ok: false, error: "erro_ao_gravar" });
  });

  it("com token novo, segue pelo upsert, com o token cifrado", async () => {
    const r = await updateAdInsightsConnection({ platform: "meta_ads", access_token: "EAA" + "x".repeat(30) });

    expect(r).toEqual({ ok: true });
    expect(banco.chamadas.map((c) => c.operacao)).toEqual(["upsert"]);
    expect(banco.chamadas[0]?.valores).toMatchObject({ access_token_encrypted: "cifrado" });
  });

  it("primeira conexão sem token continua recusada antes de tocar o banco", async () => {
    banco.existente = null;

    const r = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: "act_123" });

    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(banco.chamadas).toEqual([]);
  });
});
