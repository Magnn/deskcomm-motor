/**
 * A porta da assinatura nasce FECHADA e só abre para o dono da instalação —
 * as mesmas guardas de `/api/v1/tenants/provision`, na mesma ordem: sem segredo
 * a rota não existe, o limite segura quem tenta adivinhar, o segredo vem antes
 * do corpo, e a regra só roda depois das três.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { TENANT_PROVISIONING_SECRET: "" },
  ativar: vi.fn(),
  suspender: vi.fn(),
  limite: vi.fn(),
  espiar: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: h.limite, peekRateLimit: h.espiar }));
vi.mock("@/lib/tenants/assinatura", () => ({ ativarAssinatura: h.ativar, suspenderAssinatura: h.suspender }));
vi.mock("@/lib/auth/provision", () => ({
  EmailJaTemContaError: class extends Error {},
  ProvisionConflictError: class extends Error {},
}));

const { POST } = await import("./route");
const { EmailJaTemContaError } = await import("@/lib/auth/provision");

const SEGREDO = "s".repeat(40);
const ATIVA = {
  integration: "cakto",
  external_id: "assinatura-42",
  status: "active",
  organization_name: "Clínica Sorriso",
  owner_email: "dona@clinica.test",
  owner_name: "Dona",
};

const pedido = (bearer: string | null, corpo: unknown = ATIVA) =>
  new NextRequest("http://localhost/api/v1/tenants/subscription", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(corpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.env.TENANT_PROVISIONING_SECRET = SEGREDO;
  h.espiar.mockResolvedValue(0);
  h.limite.mockResolvedValue({ allowed: true });
  h.ativar.mockResolvedValue({
    ok: true,
    organizationId: "org-1",
    status: "active",
    criada: true,
    linkDeAcesso: "https://app/auth/confirm?token_hash=x&type=recovery",
    fluxosEncerrados: 0,
  });
  h.suspender.mockResolvedValue({ ok: true, organizationId: "org-1", status: "suspended", criada: false, linkDeAcesso: null, fluxosEncerrados: 2 });
});

describe("POST /api/v1/tenants/subscription — as guardas", () => {
  it("sem segredo na instalação a rota não existe: 404, e a regra não roda", async () => {
    h.env.TENANT_PROVISIONING_SECRET = "";
    expect((await POST(pedido(SEGREDO))).status).toBe(404);
    h.env.TENANT_PROVISIONING_SECRET = "curto";
    expect((await POST(pedido("curto"))).status).toBe(404);
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("segredo errado ou ausente: 401, conta a falha, e a regra não roda", async () => {
    expect((await POST(pedido("x".repeat(40)))).status).toBe(401);
    expect((await POST(pedido(null))).status).toBe(401);
    expect(h.limite).toHaveBeenCalledTimes(2);
    expect(h.ativar).not.toHaveBeenCalled();
    expect(h.suspender).not.toHaveBeenCalled();
  });

  it("quem já errou demais é barrado ANTES de o segredo ser conferido — mesmo com o segredo certo", async () => {
    h.espiar.mockResolvedValue(10);
    expect((await POST(pedido(SEGREDO))).status).toBe(429);
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("corpo fora do contrato: 422, e a regra não roda", async () => {
    const res = await POST(pedido(SEGREDO, { ...ATIVA, status: "pago" }));
    expect(res.status).toBe(422);
    expect(h.ativar).not.toHaveBeenCalled();
    // Campo que o contrato não conhece também é recusado (strict).
    expect((await POST(pedido(SEGREDO, { ...ATIVA, organization_id: "org-de-outro" }))).status).toBe(422);
  });
});

describe("POST /api/v1/tenants/subscription — o que responde", () => {
  it("primeiro pagamento: 201 com o link de acesso, sem cache", async () => {
    const res = await POST(pedido(SEGREDO));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toEqual({
      organization_id: "org-1",
      status: "active",
      created: true,
      access_link: "https://app/auth/confirm?token_hash=x&type=recovery",
      flows_stopped: 0,
    });
    expect(h.ativar).toHaveBeenCalledWith(
      expect.objectContaining({ integration: "cakto", externalId: "assinatura-42", ownerEmail: "dona@clinica.test" }),
    );
  });

  it("suspensão: 200 dizendo quantos fluxos pararam; só precisa do par e do status", async () => {
    const res = await POST(pedido(SEGREDO, { integration: "cakto", external_id: "assinatura-42", status: "suspended", reason: "Cartão recusado" }));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ status: "suspended", created: false, access_link: null, flows_stopped: 2 });
    expect(h.suspender).toHaveBeenCalledWith(expect.objectContaining({ reason: "Cartão recusado" }));
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("suspender empresa que não é desta assinatura: 404", async () => {
    h.suspender.mockResolvedValue({ ok: false, motivo: "empresa_nao_encontrada" });
    const res = await POST(pedido(SEGREDO, { integration: "cakto", external_id: "x", status: "suspended" }));
    expect(res.status).toBe(404);
  });

  it("primeiro pagamento sem os dados do dono: 422 dizendo o que falta", async () => {
    h.ativar.mockResolvedValue({ ok: false, motivo: "dados_do_dono_faltando" });
    const res = await POST(pedido(SEGREDO, { integration: "cakto", external_id: "nova", status: "active" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("owner_email");
  });

  it("e-mail do dono já tem conta: 409 legível, não 500", async () => {
    h.ativar.mockRejectedValue(new EmailJaTemContaError());
    expect((await POST(pedido(SEGREDO))).status).toBe(409);
  });

  it("falha inesperada: 500 sem vazar o detalhe", async () => {
    h.ativar.mockRejectedValue(new Error("assinatura: busca da empresa falhou: timeout no pooler"));
    const res = await POST(pedido(SEGREDO));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("pooler");
  });
});
