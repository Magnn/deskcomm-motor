/**
 * A assinatura liga e desliga o acesso. O que se cobra aqui é a REGRA: quem é
 * criado, quem é reativado, quem é suspenso — e, principalmente, quem NÃO pode
 * ser tocado por um aviso de pagamento que não é dele.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  provision: vi.fn(),
  audit: vi.fn(async () => undefined),
  generateLink: vi.fn(),
  admin: null as unknown,
}));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.exemplo.test/" } }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/auth/provision", () => ({
  provisionExternalTenant: h.provision,
  slugDoProvisionamento: (i: string, e: string) => `${i}-${e}`,
}));

const { ativarAssinatura, suspenderAssinatura } = await import("./assinatura");

type Empresa = { id: string; status: string; created_by: string | null; settings: unknown } | null;

let empresa: Empresa;
let updatesDaEmpresa: Array<Record<string, unknown>>;
let fluxosVivos: number;
let filtrosDosFluxos: Array<[string, unknown]>;
let slugBuscado: string | null;

function adminFake() {
  return {
    auth: { admin: { generateLink: h.generateLink } },
    from(tabela: string) {
      if (tabela === "organizations") {
        const leitura = {
          select: () => leitura,
          eq: (_c: string, v: string) => {
            slugBuscado = v;
            return leitura;
          },
          maybeSingle: async () => ({ data: empresa, error: null }),
        };
        return {
          ...leitura,
          update(patch: Record<string, unknown>) {
            updatesDaEmpresa.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      // followup_enrollments
      return {
        update() {
          const q = {
            eq: (c: string, v: unknown) => {
              filtrosDosFluxos.push([c, v]);
              return q;
            },
            in: (c: string, v: unknown) => {
              filtrosDosFluxos.push([c, v]);
              return q;
            },
            select: async () => ({ data: Array.from({ length: fluxosVivos }, (_, i) => ({ id: `e${i}` })), error: null }),
          };
          return q;
        },
      };
    },
  };
}

const PAR = { integration: "cakto", externalId: "assinatura-42", requestId: "req-1" };
const DONO = { organizationName: "Clínica Sorriso", ownerEmail: "Dona@Clinica.test", ownerName: "Dona" };
const daAssinatura = (status: string): Empresa => ({
  id: "org-1",
  status,
  created_by: "u1",
  settings: { provisioning: { integration: "cakto", external_id: "assinatura-42" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  empresa = null;
  updatesDaEmpresa = [];
  fluxosVivos = 0;
  filtrosDosFluxos = [];
  slugBuscado = null;
  h.admin = adminFake();
  h.provision.mockResolvedValue({ organizationId: "org-nova", ownerId: "u9", replay: false });
  h.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "tok/hash+1" } }, error: null });
});

describe("assinatura ativa", () => {
  it("primeiro pagamento: cria a empresa e devolve o link de uso único para o dono definir a senha", async () => {
    const r = await ativarAssinatura({ ...PAR, ...DONO });
    expect(h.provision).toHaveBeenCalledWith(
      expect.objectContaining({ integration: "cakto", externalId: "assinatura-42", ownerEmail: "Dona@Clinica.test" }),
    );
    expect(r).toEqual({
      ok: true,
      organizationId: "org-nova",
      status: "active",
      criada: true,
      linkDeAcesso: "https://app.exemplo.test/auth/confirm?token_hash=tok%2Fhash%2B1&type=recovery",
      fluxosEncerrados: 0,
    });
    // O link é pedido para o e-mail normalizado, o mesmo que o provisionamento gravou.
    expect(h.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "dona@clinica.test" });
  });

  it("primeiro pagamento SEM os dados do dono: não cria nada e diz o que falta", async () => {
    const r = await ativarAssinatura(PAR);
    expect(r).toEqual({ ok: false, motivo: "dados_do_dono_faltando" });
    expect(h.provision).not.toHaveBeenCalled();
  });

  it("renovação de empresa em dia: não mexe em nada e NÃO gera link novo (o aviso é reentregue todo mês)", async () => {
    empresa = daAssinatura("active");
    const r = await ativarAssinatura(PAR);
    expect(r).toMatchObject({ ok: true, organizationId: "org-1", criada: false, linkDeAcesso: null });
    expect(updatesDaEmpresa).toEqual([]);
    expect(h.provision).not.toHaveBeenCalled();
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("voltou a pagar: a empresa suspensa é reativada, com a suspensão limpa", async () => {
    empresa = daAssinatura("suspended");
    const r = await ativarAssinatura(PAR);
    expect(r).toMatchObject({ ok: true, status: "active", criada: false });
    expect(updatesDaEmpresa[0]).toMatchObject({ status: "active", suspended_at: null, suspended_reason: null, suspended_by: null });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.reactivated", organizationId: "org-1" }));
  });

  it("o link não saiu (servidor de autenticação falhou): a empresa fica criada, e a resposta diz que não há link", async () => {
    h.generateLink.mockResolvedValue({ data: null, error: { message: "smtp fora" } });
    const r = await ativarAssinatura({ ...PAR, ...DONO });
    expect(r).toMatchObject({ ok: true, criada: true, linkDeAcesso: null });
  });

  it("replay do provisionamento (corrida entre dois avisos): não é 'criada' e não gera segundo link", async () => {
    h.provision.mockResolvedValue({ organizationId: "org-nova", ownerId: "u9", replay: true });
    const r = await ativarAssinatura({ ...PAR, ...DONO });
    expect(r).toMatchObject({ ok: true, criada: false, linkDeAcesso: null });
    expect(h.generateLink).not.toHaveBeenCalled();
  });
});

describe("assinatura suspensa", () => {
  it("suspende a empresa DESTA assinatura e encerra os fluxos em andamento dela", async () => {
    empresa = daAssinatura("active");
    fluxosVivos = 3;
    const r = await suspenderAssinatura({ ...PAR, reason: "Pagamento recusado" });
    expect(slugBuscado).toBe("cakto-assinatura-42");
    expect(updatesDaEmpresa[0]).toMatchObject({ status: "suspended", suspended_reason: "Pagamento recusado" });
    expect(r).toMatchObject({ ok: true, organizationId: "org-1", status: "suspended", fluxosEncerrados: 3 });
    // Só os fluxos DESTA empresa, e só os vivos.
    expect(filtrosDosFluxos[0]).toEqual(["organization_id", "org-1"]);
    expect(filtrosDosFluxos[1]![0]).toBe("status");
    expect(filtrosDosFluxos[1]![1]).toEqual(expect.arrayContaining(["active", "waiting_reply"]));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.suspended" }));
  });

  it("aviso repetido: não regrava a suspensão, mas ainda encerra o que tiver sobrado vivo", async () => {
    empresa = daAssinatura("suspended");
    fluxosVivos = 1;
    const r = await suspenderAssinatura(PAR);
    expect(updatesDaEmpresa).toEqual([]);
    expect(r).toMatchObject({ ok: true, status: "suspended", fluxosEncerrados: 1 });
  });

  it("empresa que não existe: nada é suspenso", async () => {
    expect(await suspenderAssinatura(PAR)).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    expect(updatesDaEmpresa).toEqual([]);
  });

  it("empresa com o mesmo endereço mas que NÃO nasceu desta assinatura: não é tocada", async () => {
    // Criada à mão no painel, ou por outra integração: um aviso de pagamento
    // alheio não pode suspender a empresa de outro cliente.
    empresa = { id: "org-x", status: "active", created_by: "u1", settings: { provisioning: { integration: "outra", external_id: "assinatura-42" } } };
    expect(await suspenderAssinatura(PAR)).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    empresa = { id: "org-x", status: "active", created_by: "u1", settings: {} };
    expect(await suspenderAssinatura(PAR)).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    expect(updatesDaEmpresa).toEqual([]);
  });
});
