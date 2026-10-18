import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O CRON DA FRANQUIA COBRA SÓ O QUE PASSOU, E UMA VEZ SÓ.
 *
 * O que este arquivo guarda:
 *  - informa à Stripe só a diferença desde o último informe do MESMO ciclo; ciclo novo recomeça do zero;
 *  - dentro da franquia, ou com o preço do excedente desligado, mede e grava mas não informa nada;
 *  - a Stripe é avisada ANTES do banco, com a chave que se repete quando o total se repete;
 *  - falha numa empresa não impede as outras; rodada sem efeito não audita.
 */

const h = vi.hoisted(() => ({
  linhas: [] as Record<string, unknown>[],
  updates: [] as { patch: Record<string, unknown>; org: unknown }[],
  ordem: [] as string[],
  usadas: new Map<string, number>(),
  centavos: 120,
  assinatura: vi.fn(),
  garantir: vi.fn(),
  informar: vi.fn(),
  audit: vi.fn(),
}));

const CICLO = new Date("2026-10-17T15:00:00.000Z");

vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: () => true }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "AcassIA" }) }));
vi.mock("@/lib/env", () => ({
  env: {
    get STRIPE_PLANS_EXCEDENTE_CENTAVOS() {
      return h.centavos;
    },
  },
}));
vi.mock("@/lib/planos/assinatura-da-organizacao", () => ({
  planosDaInstalacao: () => [
    { id: "start", nome: "Start", precoMensalCentavos: 29_700, numeros: 1, iaMensalCentavosUsd: 9_000, conversasMensais: 300 },
    { id: "velho", nome: "Velho", precoMensalCentavos: 9_700, numeros: 1, iaMensalCentavosUsd: 500, conversasMensais: 0 },
  ],
}));
vi.mock("@/lib/planos/stripe-dos-planos", () => ({
  configuracaoDaStripeDosPlanos: () => ({ chave: "sk_test_x", segredoDoAviso: "" }),
  criarStripeDosPlanos: () => ({
    lerAssinatura: h.assinatura,
    garantirExcedenteNaAssinatura: async (...a: unknown[]) => {
      h.ordem.push("garantir");
      return h.garantir(...a);
    },
    informarExcedente: async (...a: unknown[]) => {
      h.ordem.push("informar");
      return h.informar(...a);
    },
  }),
}));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({
  getRequestPool: () => ({
    query: async (_sql: string, params: unknown[]) => ({ rows: [{ n: h.usadas.get(params[0] as string) ?? 0 }] }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const leitura: Record<string, unknown> = {};
      for (const m of ["select", "eq", "like"]) leitura[m] = () => leitura;
      leitura.limit = async () => ({ data: h.linhas, error: null });
      leitura.update = (patch: Record<string, unknown>) => ({
        eq: async (_c: string, org: unknown) => {
          h.ordem.push("gravar");
          h.updates.push({ patch, org });
          return { error: null };
        },
      });
      return leitura;
    },
  }),
}));

const rodar = async () => {
  const { GET } = await import("@/app/api/v1/cron/excedente-de-conversas/route");
  const res = await GET(new NextRequest("https://crm.test/api/v1/cron/excedente-de-conversas"));
  return (await res.json()) as { data: { medidas: number; informadas: number; falhas: number; motivo?: string } };
};

const linha = (org: string, extra: Record<string, unknown> = {}) => ({
  organization_id: org,
  plan_id: "start",
  reference: `sub_${org}`,
  excedente_ciclo_inicio: null,
  excedente_informado: 0,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.linhas = [];
  h.updates = [];
  h.ordem = [];
  h.usadas = new Map();
  h.centavos = 120;
  h.assinatura.mockImplementation(async (id: string) => ({
    id,
    status: "active",
    clienteId: `cus_${id}`,
    organizationId: null,
    planoId: "start",
    itemId: "si_plano",
    itemDoExcedente: null,
    cicloInicio: CICLO,
    cicloFim: new Date("2026-11-17T15:00:00.000Z"),
  }));
});

describe("cron excedente-de-conversas", () => {
  it("primeiro informe do ciclo: manda o excedente inteiro, Stripe antes do banco", async () => {
    h.linhas = [linha("a")];
    h.usadas.set("a", 312);
    const r = await rodar();
    expect(r.data).toMatchObject({ medidas: 1, informadas: 1, falhas: 0 });
    expect(h.informar).toHaveBeenCalledWith({ clienteId: "cus_sub_a", quantidade: 12, chave: "excedente-a-2026-10-17-12" });
    expect(h.ordem).toEqual(["garantir", "informar", "gravar"]);
    expect(h.updates[0]?.patch).toMatchObject({ conversas_no_ciclo: 312, excedente_informado: 12, excedente_ciclo_inicio: CICLO.toISOString() });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "plano.excedente_informado", organizationId: "a" }));
  });

  it("no mesmo ciclo, só a diferença; sem diferença, nada sai e nada audita", async () => {
    h.linhas = [linha("a", { excedente_ciclo_inicio: CICLO.toISOString(), excedente_informado: 12 })];
    h.usadas.set("a", 320);
    await rodar();
    expect(h.informar).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 8 }));
    expect(h.updates[0]?.patch.excedente_informado).toBe(20);

    vi.clearAllMocks();
    h.updates = [];
    h.linhas = [linha("a", { excedente_ciclo_inicio: CICLO.toISOString(), excedente_informado: 20 })];
    const r = await rodar();
    expect(h.informar).not.toHaveBeenCalled();
    expect(r.data).toMatchObject({ medidas: 1, informadas: 0 });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("ciclo novo recomeça do zero", async () => {
    h.linhas = [linha("a", { excedente_ciclo_inicio: "2026-09-17T15:00:00.000Z", excedente_informado: 40 })];
    h.usadas.set("a", 303);
    await rodar();
    expect(h.informar).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 3 }));
    expect(h.updates[0]?.patch.excedente_informado).toBe(3);
  });

  it("dentro da franquia, ou com o preço desligado, mede mas não cobra", async () => {
    h.linhas = [linha("a")];
    h.usadas.set("a", 250);
    await rodar();
    expect(h.informar).not.toHaveBeenCalled();
    expect(h.updates[0]?.patch).toMatchObject({ conversas_no_ciclo: 250, excedente_informado: 0 });

    h.updates = [];
    h.centavos = 0;
    h.usadas.set("a", 900);
    await rodar();
    expect(h.informar).not.toHaveBeenCalled();
    expect(h.updates[0]?.patch).toMatchObject({ conversas_no_ciclo: 900, excedente_informado: 0 });
  });

  it("plano sem franquia fica de fora; falha numa empresa não para as outras", async () => {
    h.linhas = [linha("velha", { plan_id: "velho" }), linha("quebra"), linha("b")];
    h.usadas.set("b", 301);
    h.assinatura.mockImplementationOnce(async () => {
      throw new Error("stripe fora");
    });
    const r = await rodar();
    expect(r.data).toMatchObject({ medidas: 1, informadas: 1, falhas: 1 });
    expect(h.updates.map((u) => u.org)).toEqual(["b"]);
  });
});
