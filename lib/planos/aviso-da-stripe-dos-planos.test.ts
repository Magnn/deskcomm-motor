import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  atual: null as null | { planoId: string; status: "ativa" | "inativa"; origem: string; referencia: string | null },
  ativou: [] as unknown[],
  inativou: [] as unknown[],
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/tenants/assinatura", () => ({ encerrarFluxosDaEmpresa: vi.fn(async () => 0) }));
vi.mock("./assinatura-da-organizacao", () => ({
  planosDaInstalacao: () => [
    { id: "start", nome: "Start", precoMensalCentavos: 9_700, numeros: 1, iaMensalCentavosUsd: 0, conversasMensais: 0 },
    { id: "pro", nome: "Pro", precoMensalCentavos: 19_700, numeros: 3, iaMensalCentavosUsd: 0, conversasMensais: 0 },
  ],
  lerAssinatura: vi.fn(async () => estado.atual),
  ativarPlano: vi.fn(async (_a: unknown, p: unknown) => {
    estado.ativou.push(p);
  }),
  inativarPlano: vi.fn(async (_a: unknown, p: unknown) => {
    estado.inativou.push(p);
    return true;
  }),
}));

import { aplicarAvisoDaStripeDosPlanos } from "./aviso-da-stripe-dos-planos";

const ORG = "11111111-2222-4333-8444-555555555555";

function assinatura(status: string, id = "sub_1", plano = "pro") {
  return {
    id,
    status,
    customer: "cus_1",
    metadata: { organization_id: ORG, plan_id: plano },
    items: { data: [{ id: "si_1", price: { metadata: { plan_id: plano } } }] },
  };
}

const deps = (lida: Record<string, unknown> | null = null) => ({
  admin: {} as never,
  lerAssinatura: vi.fn(async () => (lida ? (await import("./stripe-dos-planos")).lerAssinaturaDaStripe(lida) : null)),
  encerrarFluxos: vi.fn(async () => 2),
});

beforeEach(() => {
  estado.atual = null;
  estado.ativou = [];
  estado.inativou = [];
});

describe("aviso da Stripe dos planos", () => {
  it("checkout concluído liga o plano da empresa que abriu o checkout", async () => {
    const d = deps(assinatura("active"));
    const r = await aplicarAvisoDaStripeDosPlanos(
      { type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1" } } },
      d,
      "req",
    );
    expect(r).toEqual({ resultado: "plano_ativado", organizationId: ORG, planoId: "pro" });
    expect(estado.ativou).toEqual([{ organizationId: ORG, planoId: "pro", origem: "stripe", referencia: "sub_1" }]);
  });

  it("primeiro pagamento ainda incompleto não liga nem derruba", async () => {
    const r = await aplicarAvisoDaStripeDosPlanos({ type: "customer.subscription.created", data: { object: assinatura("incomplete") } }, deps(), "req");
    expect(r.resultado).toBe("sem_efeito");
    expect(estado.ativou).toEqual([]);
  });

  it("atraso derruba o plano da Stripe e encerra os fluxos", async () => {
    estado.atual = { planoId: "pro", status: "ativa", origem: "stripe", referencia: "sub_1" };
    const d = deps();
    const r = await aplicarAvisoDaStripeDosPlanos({ type: "customer.subscription.updated", data: { object: assinatura("past_due") } }, d, "req");
    expect(r).toEqual({ resultado: "plano_inativado", organizationId: ORG, fluxosEncerrados: 2 });
    expect(d.encerrarFluxos).toHaveBeenCalled();
  });

  it("cancelamento de uma assinatura ANTIGA não derruba a atual", async () => {
    estado.atual = { planoId: "pro", status: "ativa", origem: "stripe", referencia: "sub_novo" };
    const r = await aplicarAvisoDaStripeDosPlanos(
      { type: "customer.subscription.deleted", data: { object: assinatura("canceled", "sub_velho") } },
      deps(),
      "req",
    );
    expect(r).toMatchObject({ resultado: "sem_efeito", motivo: "assinatura_antiga" });
    expect(estado.inativou).toEqual([]);
  });

  it("plano de cortesia (manual) não cai por aviso da Stripe", async () => {
    estado.atual = { planoId: "scale", status: "ativa", origem: "manual", referencia: null };
    const r = await aplicarAvisoDaStripeDosPlanos({ type: "customer.subscription.deleted", data: { object: assinatura("canceled") } }, deps(), "req");
    expect(r).toMatchObject({ resultado: "sem_efeito", motivo: "sem_plano_da_stripe" });
  });

  it("assinatura sem empresa nos metadados (outro produto da conta) é ignorada", async () => {
    const r = await aplicarAvisoDaStripeDosPlanos(
      { type: "customer.subscription.updated", data: { object: { ...assinatura("active"), metadata: {} } } },
      deps(),
      "req",
    );
    expect(r).toMatchObject({ resultado: "ignorado", motivo: "assinatura_de_fora" });
  });

  it("plano fora do catálogo não é inventado", async () => {
    const r = await aplicarAvisoDaStripeDosPlanos(
      { type: "customer.subscription.updated", data: { object: assinatura("active", "sub_1", "ouro") } },
      deps(),
      "req",
    );
    expect(r).toMatchObject({ resultado: "sem_efeito", motivo: "plano_desconhecido" });
  });
});
