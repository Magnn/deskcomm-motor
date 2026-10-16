import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O CRON RENOVA O TOKEN DE 60 DIAS DO NÚMERO OFICIAL ANTES DE ELE VENCER.
 *
 * O que este arquivo guarda:
 *  - só os canais oficiais vivos que vencem em até 20 dias entram na rodada;
 *  - o token novo é gravado cifrado, com a nova data, filtrando pela organização;
 *  - recusa da Meta não derruba o canal (o token atual segue valendo) e não
 *    impede os outros números;
 *  - rodada sem efeito não audita.
 */

const h = vi.hoisted(() => ({
  linhas: [] as Record<string, unknown>[],
  filtros: [] as [string, unknown][],
  updates: [] as { patch: Record<string, unknown>; eq: [string, unknown][] }[],
  renovar: vi.fn(),
  audit: vi.fn(),
  app: { appId: "app1", appSecret: "segredo" } as { appId: string | null; appSecret: string | null },
}));

vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: () => true }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/channels/meta/app", () => ({
  appDaMeta: async () => h.app,
  // Mesma regra do resolvedor real: nulo/o app em vigor → o em vigor; aposentado → o guardado.
  credencialDoAppDoNumero: async (id: string | null) => {
    if (!id || id === h.app.appId) return h.app.appId && h.app.appSecret ? h.app : null;
    return id === "app-velho" ? { appId: "app-velho", appSecret: "segredo-velho" } : null;
  },
}));
vi.mock("@/lib/channels/meta/cadastro-incorporado", () => ({ renovarTokenDoNumero: h.renovar }));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async (_a: unknown, v: string) => v.replace(/^cifra\(|\)$/g, ""),
  encryptWebhookSecret: async (_a: unknown, v: string) => `cifra(${v})`,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const leitura: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "not", "lte", "order"]) {
        leitura[m] = (...a: unknown[]) => {
          h.filtros.push([m, a]);
          return leitura;
        };
      }
      leitura.limit = async () => ({ data: h.linhas, error: null });
      leitura.update = (patch: Record<string, unknown>) => {
        const registro = { patch, eq: [] as [string, unknown][] };
        h.updates.push(registro);
        const cadeia = {
          eq: (c: string, v: unknown) => {
            registro.eq.push([c, v]);
            return Object.assign(Promise.resolve({ error: null }), cadeia);
          },
        };
        return cadeia;
      };
      return leitura;
    },
  }),
}));

const rodar = async () => {
  const { GET } = await import("@/app/api/v1/cron/meta-tokens/route");
  const res = await GET(new NextRequest("https://crm.test/api/v1/cron/meta-tokens"));
  return (await res.json()) as { data: { renovados: number; falhas: number; motivo?: string } };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.linhas = [];
  h.filtros = [];
  h.updates = [];
  h.app = { appId: "app1", appSecret: "segredo" };
});

describe("cron meta-tokens", () => {
  it("🛟 número de um app aposentado renova com a chave DELE (0933)", async () => {
    h.linhas = [
      { id: "c1", organization_id: "org1", meta_token_encrypted: "cifra(velho)", meta_token_expires_at: "2026-10-20T00:00:00Z", meta_app_id: "app-velho" },
    ];
    h.renovar.mockResolvedValue({ ok: true, token: "novo", expiraEm: new Date("2026-12-19T00:00:00Z") });

    const r = await rodar();

    expect(r.data).toEqual({ renovados: 1, falhas: 0 });
    expect(h.renovar).toHaveBeenCalledWith({ appId: "app-velho", appSecret: "segredo-velho", token: "velho" });
  });

  it("número de um app que a instalação não conhece falha sozinho, sem inventar chave", async () => {
    h.linhas = [
      { id: "c1", organization_id: "org1", meta_token_encrypted: "cifra(velho)", meta_token_expires_at: "2026-10-20T00:00:00Z", meta_app_id: "app-estranho" },
    ];
    const r = await rodar();
    expect(r.data).toEqual({ renovados: 0, falhas: 1 });
    expect(h.renovar).not.toHaveBeenCalled();
  });

  it("⭐ renova quem vence e grava o token novo cifrado, com a nova data, na organização certa", async () => {
    h.linhas = [{ id: "c1", organization_id: "org1", meta_token_encrypted: "cifra(velho)", meta_token_expires_at: "2026-10-20T00:00:00Z" }];
    h.renovar.mockResolvedValue({ ok: true, token: "novo", expiraEm: new Date("2026-12-19T00:00:00Z") });

    const r = await rodar();

    expect(r.data).toEqual({ renovados: 1, falhas: 0 });
    expect(h.renovar).toHaveBeenCalledWith({ appId: "app1", appSecret: "segredo", token: "velho" });
    expect(h.updates).toEqual([
      {
        patch: { meta_token_encrypted: "cifra(novo)", meta_token_expires_at: "2026-12-19T00:00:00.000Z" },
        eq: [
          ["id", "c1"],
          ["organization_id", "org1"],
        ],
      },
    ]);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cron.meta_tokens", metadata: { renovados: 1, falhas: 0 } }));
  });

  it("só olha canais oficiais vivos, com token, que vencem dentro da antecedência", async () => {
    await rodar();

    const f = Object.fromEntries(h.filtros.map(([m, a]) => [`${m}:${(a as unknown[])[0]}`, (a as unknown[])[1]]));
    expect(f["eq:provider"]).toBe("meta_cloud");
    expect(f["is:archived_at"]).toBeNull();
    expect(h.filtros.some(([m, a]) => m === "not" && (a as unknown[])[0] === "meta_token_encrypted")).toBe(true);
    const limite = Date.parse(String(f["lte:meta_token_expires_at"]));
    expect(limite - Date.now()).toBeGreaterThan(19 * 86_400_000);
    expect(limite - Date.now()).toBeLessThanOrEqual(20 * 86_400_000);
  });

  it("recusa da Meta não grava nada nesse número e não impede o próximo", async () => {
    h.linhas = [
      { id: "c1", organization_id: "org1", meta_token_encrypted: "cifra(a)", meta_token_expires_at: "2026-10-20T00:00:00Z" },
      { id: "c2", organization_id: "org2", meta_token_encrypted: "cifra(b)", meta_token_expires_at: "2026-10-21T00:00:00Z" },
    ];
    h.renovar
      .mockResolvedValueOnce({ ok: false, motivo: "Session has expired" })
      .mockResolvedValueOnce({ ok: true, token: "b2", expiraEm: null });

    const r = await rodar();

    expect(r.data).toEqual({ renovados: 1, falhas: 1 });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]!.eq).toContainEqual(["id", "c2"]);
  });

  it("rodada sem número a renovar não audita", async () => {
    const r = await rodar();

    expect(r.data).toEqual({ renovados: 0, falhas: 0 });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("instalação sem app da Meta: não faz nada", async () => {
    h.app = { appId: null, appSecret: null };

    const r = await rodar();

    expect(r.data.motivo).toBe("app_da_meta_nao_configurado");
    expect(h.renovar).not.toHaveBeenCalled();
  });
});
