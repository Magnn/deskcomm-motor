/**
 * O pagamento de um plano acha a empresa CERTA — e só ela. O que se cobra: quem já
 * tem conta recebe o plano na própria empresa (sem ganhar uma segunda), só quem
 * ADMINISTRA recebe, quem não tem conta ganha uma, e a queda não suspende a conta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: null as unknown,
  acharEmpresa: vi.fn(),
  ativarAssinatura: vi.fn(),
  encerrarFluxos: vi.fn(),
  ativarPlano: vi.fn(),
  inativarPlano: vi.fn(),
  audit: vi.fn(async () => undefined),
}));

class EmailJaTemContaError extends Error {}

vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/auth/provision", () => ({ EmailJaTemContaError }));
vi.mock("@/lib/tenants/assinatura", () => ({
  acharEmpresa: h.acharEmpresa,
  ativarAssinatura: h.ativarAssinatura,
  encerrarFluxosDaEmpresa: h.encerrarFluxos,
}));
vi.mock("./assinatura-da-organizacao", () => ({ ativarPlano: h.ativarPlano, inativarPlano: h.inativarPlano }));

const { aplicarPagamentoDoPlano, aplicarQuedaDoPlano } = await import("./pagamento-do-plano");

let contas: Array<{ id: string; email: string }>;
let vinculos: Array<{ user_id: string; organization_id: string; role: string; revoked_at: string | null; accepted_at: string }>;
let erroDoDiretorio: string | null;

function adminFake() {
  return {
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number }) =>
          erroDoDiretorio
            ? { data: { users: [] }, error: { message: erroDoDiretorio } }
            : { data: { users: page === 1 ? contas : [] }, error: null },
      },
    },
    from() {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return q;
        },
        is: () => q,
        order: () => q,
        limit: async () => ({
          data: vinculos
            .filter((v) => v.user_id === filtros.user_id && v.role === filtros.role && v.revoked_at === null)
            .sort((a, b) => a.accepted_at.localeCompare(b.accepted_at))
            .slice(0, 1),
          error: null,
        }),
      };
      return q;
    },
  };
}

const PAGAMENTO = { integration: "cakto", email: "dona@clinica.test", nome: "Dona Maria", planoId: "pro", requestId: "req-1" };

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = adminFake();
  contas = [];
  vinculos = [];
  erroDoDiretorio = null;
  h.acharEmpresa.mockResolvedValue(null);
  h.ativarAssinatura.mockResolvedValue({ ok: true, organizationId: "org-nova", status: "active", criada: true, linkDeAcesso: "https://app/x", fluxosEncerrados: 0 });
  h.encerrarFluxos.mockResolvedValue(4);
  h.ativarPlano.mockResolvedValue(undefined);
  h.inativarPlano.mockResolvedValue(true);
});

describe("pagou", () => {
  it("⭐ quem já se cadastrou de graça recebe o plano NA PRÓPRIA empresa — sem criar outra", async () => {
    contas = [{ id: "u1", email: "Dona@Clinica.Test" }];
    vinculos = [{ user_id: "u1", organization_id: "org-dela", role: "admin", revoked_at: null, accepted_at: "2026-09-01" }];

    const r = await aplicarPagamentoDoPlano(PAGAMENTO);

    expect(r).toEqual({ ok: true, organizationId: "org-dela", criada: false, linkDeAcesso: null });
    expect(h.ativarAssinatura).not.toHaveBeenCalled();
    expect(h.ativarPlano).toHaveBeenCalledWith(h.admin, { organizationId: "org-dela", planoId: "pro", origem: "cakto", referencia: "dona@clinica.test" });
  });

  it("administra duas empresas: o plano vai para a mais antiga", async () => {
    contas = [{ id: "u1", email: "dona@clinica.test" }];
    vinculos = [
      { user_id: "u1", organization_id: "org-nova", role: "admin", revoked_at: null, accepted_at: "2026-09-20" },
      { user_id: "u1", organization_id: "org-antiga", role: "admin", revoked_at: null, accepted_at: "2026-08-01" },
    ];
    expect(await aplicarPagamentoDoPlano(PAGAMENTO)).toMatchObject({ organizationId: "org-antiga" });
  });

  it("sem conta nenhuma: a empresa nasce, e o link de acesso volta para ser enviado", async () => {
    const r = await aplicarPagamentoDoPlano(PAGAMENTO);
    expect(r).toEqual({ ok: true, organizationId: "org-nova", criada: true, linkDeAcesso: "https://app/x" });
    expect(h.ativarAssinatura).toHaveBeenCalledWith(expect.objectContaining({ integration: "cakto", externalId: "dona@clinica.test", ownerEmail: "dona@clinica.test" }));
    expect(h.ativarPlano).toHaveBeenCalledWith(h.admin, expect.objectContaining({ organizationId: "org-nova", planoId: "pro" }));
  });

  it("renovação de quem nasceu de uma compra: acha pela marca do provisionamento, sem varrer contas", async () => {
    h.acharEmpresa.mockResolvedValue({ id: "org-da-compra", status: "active", created_by: "u9" });
    erroDoDiretorio = "se varresse, quebrava";
    expect(await aplicarPagamentoDoPlano(PAGAMENTO)).toMatchObject({ ok: true, organizationId: "org-da-compra", criada: false });
  });

  it("⭐ atendente (não admin) que paga NÃO dá plano à empresa do patrão — e não ganha empresa nova por cima da conta", async () => {
    contas = [{ id: "u2", email: "dona@clinica.test" }];
    vinculos = [{ user_id: "u2", organization_id: "org-do-patrao", role: "agent", revoked_at: null, accepted_at: "2026-09-01" }];
    h.ativarAssinatura.mockRejectedValue(new EmailJaTemContaError());

    expect(await aplicarPagamentoDoPlano(PAGAMENTO)).toEqual({ ok: false, motivo: "email_sem_empresa_propria" });
    expect(h.ativarPlano).not.toHaveBeenCalled();
  });

  it("admin que foi removido da empresa não conta como dono dela", async () => {
    contas = [{ id: "u1", email: "dona@clinica.test" }];
    vinculos = [{ user_id: "u1", organization_id: "org-antiga", role: "admin", revoked_at: "2026-09-10", accepted_at: "2026-08-01" }];
    h.ativarAssinatura.mockRejectedValue(new EmailJaTemContaError());
    expect(await aplicarPagamentoDoPlano(PAGAMENTO)).toEqual({ ok: false, motivo: "email_sem_empresa_propria" });
  });

  it("falha ao procurar a conta NÃO vira 'não tem conta': lança, em vez de criar uma segunda empresa", async () => {
    erroDoDiretorio = "auth fora do ar";
    await expect(aplicarPagamentoDoPlano(PAGAMENTO)).rejects.toThrow(/busca da conta do comprador falhou/);
    expect(h.ativarAssinatura).not.toHaveBeenCalled();
  });
});

describe("deixou de pagar", () => {
  const QUEDA = { integration: "cakto", email: "dona@clinica.test", motivo: "Assinatura cancelada na Cakto.", requestId: "req-2" };

  it("o plano cai, os fluxos param — e a conta NÃO é suspensa", async () => {
    contas = [{ id: "u1", email: "dona@clinica.test" }];
    vinculos = [{ user_id: "u1", organization_id: "org-dela", role: "admin", revoked_at: null, accepted_at: "2026-09-01" }];

    expect(await aplicarQuedaDoPlano(QUEDA)).toEqual({ ok: true, organizationId: "org-dela", fluxosEncerrados: 4 });
    expect(h.inativarPlano).toHaveBeenCalledWith(h.admin, { organizationId: "org-dela", motivo: "Assinatura cancelada na Cakto.", soDaOrigem: "cakto" });
    expect(h.encerrarFluxos).toHaveBeenCalledWith(h.admin, "org-dela", expect.any(String));
  });

  it("⭐ plano posto à mão pelo dono da instalação não cai, e os fluxos seguem", async () => {
    contas = [{ id: "u1", email: "dona@clinica.test" }];
    vinculos = [{ user_id: "u1", organization_id: "org-dela", role: "admin", revoked_at: null, accepted_at: "2026-09-01" }];
    h.inativarPlano.mockResolvedValue(false);

    expect(await aplicarQuedaDoPlano(QUEDA)).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    expect(h.encerrarFluxos).not.toHaveBeenCalled();
  });

  it("reembolso de quem nunca teve conta aqui: nada a derrubar", async () => {
    expect(await aplicarQuedaDoPlano(QUEDA)).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    expect(h.inativarPlano).not.toHaveBeenCalled();
  });
});
