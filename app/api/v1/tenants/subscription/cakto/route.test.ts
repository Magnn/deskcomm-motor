/**
 * O aviso da Cakto, direto na porta da assinatura. O que se cobra: a porta nasce
 * fechada, ninguém além da Cakto a abre, só o produto da assinatura tem efeito,
 * e cada evento chama a regra certa — com o cliente recebendo o acesso por e-mail.
 */
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { CAKTO_SUBSCRIPTION_SECRET: "", CAKTO_SUBSCRIPTION_PRODUCTS: "" },
  ativar: vi.fn(),
  suspender: vi.fn(),
  boasVindas: vi.fn(),
  pagarPlano: vi.fn(),
  cairPlano: vi.fn(),
  limite: vi.fn(),
  espiar: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: h.limite, peekRateLimit: h.espiar }));
vi.mock("@/lib/tenants/assinatura", () => ({ ativarAssinatura: h.ativar, suspenderAssinatura: h.suspender }));
vi.mock("@/lib/tenants/boas-vindas-da-assinatura", () => ({ enviarBoasVindasDaAssinatura: h.boasVindas }));
vi.mock("@/lib/planos/pagamento-do-plano", () => ({ aplicarPagamentoDoPlano: h.pagarPlano, aplicarQuedaDoPlano: h.cairPlano }));
vi.mock("@/lib/planos/assinatura-da-organizacao", () => ({
  planosDaInstalacao: () => [
    { id: "start", nome: "Start", precoMensalCentavos: 9700, numeros: 1 },
    { id: "pro", nome: "Pro", precoMensalCentavos: 19700, numeros: 3 },
  ],
}));
vi.mock("@/lib/auth/provision", () => ({
  EmailJaTemContaError: class extends Error {},
  ProvisionConflictError: class extends Error {},
}));

const { POST } = await import("./route");
const { EmailJaTemContaError } = await import("@/lib/auth/provision");

const SEGREDO = "b3f1a9c2-7b4d-4a8e-9f01-2c6d5b8a4e37";
const LINK = "https://app/auth/confirm?token_hash=x&type=recovery";

function aviso(evento = "purchase_approved", mudancas: Record<string, unknown> = {}) {
  return {
    secret: SEGREDO,
    event: evento,
    data: {
      id: "pedido-1",
      status: "paid",
      customer: { name: "Dona Maria", email: "Dona@Clinica.Test" },
      product: { id: "prod-uuid", short_id: "42bruPi", name: "Plano Mensal" },
      offer: { id: "a8BcHrY" },
      ...mudancas,
    },
  };
}

function pedido(corpo: unknown, opts: { assinado?: boolean; segredo?: string } = {}) {
  const cru = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const carimbo = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" };
  if (opts.assinado) {
    headers["x-cakto-timestamp"] = carimbo;
    headers["x-cakto-signature"] = `v1=${createHmac("sha256", opts.segredo ?? SEGREDO).update(`${carimbo}.${cru}`).digest("hex")}`;
  }
  return new NextRequest("http://localhost/api/v1/tenants/subscription/cakto", { method: "POST", headers, body: cru });
}

const corpoDe = async (res: Response) => ((await res.json()) as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  h.env.CAKTO_SUBSCRIPTION_SECRET = SEGREDO;
  h.env.CAKTO_SUBSCRIPTION_PRODUCTS = "a8BcHrY";
  h.espiar.mockResolvedValue(0);
  h.limite.mockResolvedValue({ allowed: true });
  h.ativar.mockResolvedValue({ ok: true, organizationId: "org-1", status: "active", criada: true, linkDeAcesso: LINK, fluxosEncerrados: 0 });
  h.suspender.mockResolvedValue({ ok: true, organizationId: "org-1", status: "suspended", criada: false, linkDeAcesso: null, fluxosEncerrados: 2 });
  h.boasVindas.mockResolvedValue({ enviado: true });
  h.pagarPlano.mockResolvedValue({ ok: true, organizationId: "org-dela", criada: false, linkDeAcesso: null });
  h.cairPlano.mockResolvedValue({ ok: true, organizationId: "org-dela", fluxosEncerrados: 3 });
});

describe("as guardas", () => {
  it("sem segredo OU sem produto a rota não existe: 404", async () => {
    h.env.CAKTO_SUBSCRIPTION_SECRET = "";
    expect((await POST(pedido(aviso()))).status).toBe(404);
    h.env.CAKTO_SUBSCRIPTION_SECRET = SEGREDO;
    h.env.CAKTO_SUBSCRIPTION_PRODUCTS = " , ";
    expect((await POST(pedido(aviso()))).status).toBe(404);
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("segredo errado, assinatura errada ou corpo que não é JSON: 401, conta a falha, e a regra não roda", async () => {
    expect((await POST(pedido({ ...aviso(), secret: "errado" }))).status).toBe(401);
    expect((await POST(pedido(aviso(), { assinado: true, segredo: "outro" }))).status).toBe(401);
    expect((await POST(pedido("isto não é json"))).status).toBe(401);
    expect(h.limite).toHaveBeenCalledTimes(3);
    expect(h.ativar).not.toHaveBeenCalled();
    expect(h.suspender).not.toHaveBeenCalled();
  });

  it("quem já errou demais é barrado antes de qualquer conferência", async () => {
    h.espiar.mockResolvedValue(10);
    expect((await POST(pedido(aviso()))).status).toBe(429);
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("aceita a assinatura do cabeçalho e também o segredo do corpo", async () => {
    expect((await POST(pedido(aviso(), { assinado: true }))).status).toBe(200);
    expect((await POST(pedido(aviso()))).status).toBe(200);
    expect(h.ativar).toHaveBeenCalledTimes(2);
  });
});

describe("o que tem efeito", () => {
  it("produto que não é a assinatura: 200 sem efeito — nem cria, nem suspende", async () => {
    const res = await POST(pedido(aviso("purchase_approved", { product: { id: "ritual" }, offer: { id: "ZZZ" } })));
    expect(res.status).toBe(200);
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "outro_produto" });
    await POST(pedido(aviso("refund", { product: { id: "ritual" }, offer: { id: "ZZZ" } })));
    expect(h.ativar).not.toHaveBeenCalled();
    expect(h.suspender).not.toHaveBeenCalled();
  });

  it("evento sem efeito (Pix gerado, tentativa recusada): 200 e nada roda", async () => {
    for (const e of ["pix_gerado", "subscription_renewal_refused", "checkout_abandonment"]) {
      const res = await POST(pedido(aviso(e)));
      expect(res.status).toBe(200);
      expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "evento_sem_efeito" });
    }
    expect(h.ativar).not.toHaveBeenCalled();
    expect(h.suspender).not.toHaveBeenCalled();
  });

  it("aviso sem e-mail do cliente: 200 sem efeito", async () => {
    const res = await POST(pedido(aviso("purchase_approved", { customer: { name: "Sem e-mail" } })));
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "aviso_sem_email_do_cliente" });
    expect(h.ativar).not.toHaveBeenCalled();
  });
});

describe("pagou", () => {
  it("primeiro pagamento: cria a empresa pela chave do E-MAIL e manda o acesso por e-mail", async () => {
    const res = await POST(pedido(aviso()));
    expect(res.status).toBe(200);
    expect(h.ativar).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: "cakto",
        externalId: "dona@clinica.test",
        organizationName: "Dona Maria",
        ownerEmail: "dona@clinica.test",
        ownerName: "Dona Maria",
      }),
    );
    expect(h.boasVindas).toHaveBeenCalledWith({
      organizationId: "org-1",
      nome: "Dona Maria",
      email: "dona@clinica.test",
      linkDeAcesso: LINK,
    });
    const data = await corpoDe(res);
    expect(data).toEqual({ resultado: "criada", organization_id: "org-1", email_enviado: true });
    // O link é credencial de uso único: não vai para a resposta (que fica no histórico da Cakto).
    expect(JSON.stringify(data)).not.toContain("token_hash");
  });

  it("renovação de quem já existe: nenhum e-mail novo", async () => {
    h.ativar.mockResolvedValue({ ok: true, organizationId: "org-1", status: "active", criada: false, linkDeAcesso: null, fluxosEncerrados: 0 });
    const res = await POST(pedido(aviso("subscription_renewed")));
    expect(await corpoDe(res)).toEqual({ resultado: "ativa", organization_id: "org-1" });
    expect(h.boasVindas).not.toHaveBeenCalled();
  });

  it("e-mail de acesso que não saiu: a empresa fica criada, o erro vai para o log SEM o link", async () => {
    h.boasVindas.mockResolvedValue({ enviado: false, motivo: "not_configured" });
    const res = await POST(pedido(aviso()));
    expect(await corpoDe(res)).toMatchObject({ resultado: "criada", email_enviado: false });
    expect(h.log.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.log.error.mock.calls)).not.toContain("token_hash");
    expect(JSON.stringify(h.log.error.mock.calls)).toContain("not_configured");
  });

  it("cliente sem nome no aviso: a empresa nasce com o começo do e-mail", async () => {
    await POST(pedido(aviso("purchase_approved", { customer: { email: "joao@loja.test" } })));
    expect(h.ativar).toHaveBeenCalledWith(expect.objectContaining({ organizationName: "joao", ownerName: "joao" }));
  });

  it("comprador cujo e-mail já tem conta aqui: 200 sem criar nada — um pagamento não toma a conta de ninguém", async () => {
    h.ativar.mockRejectedValue(new (EmailJaTemContaError as unknown as new () => Error)());
    const res = await POST(pedido(aviso()));
    expect(res.status).toBe(200);
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "email_ja_tem_conta" });
    expect(h.boasVindas).not.toHaveBeenCalled();
  });

  it("falha inesperada: 500", async () => {
    h.ativar.mockRejectedValue(new Error("banco fora"));
    expect((await POST(pedido(aviso()))).status).toBe(500);
  });
});

describe("deixou de pagar", () => {
  it("cancelamento, atraso, reembolso e chargeback suspendem, com o motivo do evento", async () => {
    for (const e of ["subscription_canceled", "subscription_late", "subscription_paused", "refund", "chargeback"]) {
      const res = await POST(pedido(aviso(e)));
      expect(await corpoDe(res)).toEqual({ resultado: "suspensa", organization_id: "org-1", flows_stopped: 2 });
    }
    expect(h.suspender).toHaveBeenCalledTimes(5);
    expect(h.suspender.mock.calls[0]![0]).toMatchObject({
      integration: "cakto",
      externalId: "dona@clinica.test",
      reason: "Assinatura cancelada na Cakto.",
    });
    expect(h.ativar).not.toHaveBeenCalled();
  });

  it("cancelamento de quem nunca virou empresa aqui: 200 sem efeito", async () => {
    h.suspender.mockResolvedValue({ ok: false, motivo: "empresa_nao_encontrada" });
    const res = await POST(pedido(aviso("subscription_canceled")));
    expect(res.status).toBe(200);
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "empresa_nao_encontrada" });
  });

  it("recuperou o atraso: libera de novo", async () => {
    h.ativar.mockResolvedValue({ ok: true, organizationId: "org-1", status: "active", criada: false, linkDeAcesso: null, fluxosEncerrados: 0 });
    const res = await POST(pedido(aviso("subscription_late_recovered")));
    expect(await corpoDe(res)).toMatchObject({ resultado: "ativa" });
  });
});

describe("oferta que vende um PLANO (código=plano)", () => {
  beforeEach(() => {
    h.env.CAKTO_SUBSCRIPTION_PRODUCTS = "a8BcHrY=pro";
  });

  it("⭐ pagou: o plano entra na empresa de quem já tem conta — nenhuma empresa é criada nem suspensa", async () => {
    const res = await POST(pedido(aviso()));
    expect(await corpoDe(res)).toEqual({ resultado: "plano_ativo", organization_id: "org-dela", plano: "pro" });
    expect(h.pagarPlano).toHaveBeenCalledWith(
      expect.objectContaining({ integration: "cakto", email: "dona@clinica.test", nome: "Dona Maria", planoId: "pro" }),
    );
    expect(h.ativar).not.toHaveBeenCalled();
    expect(h.boasVindas).not.toHaveBeenCalled();
  });

  it("pagou sem ter conta: a empresa nasce e o acesso vai por e-mail", async () => {
    h.pagarPlano.mockResolvedValue({ ok: true, organizationId: "org-nova", criada: true, linkDeAcesso: LINK });
    const res = await POST(pedido(aviso()));
    expect(await corpoDe(res)).toEqual({ resultado: "plano_ativo", organization_id: "org-nova", plano: "pro", email_enviado: true });
    expect(h.boasVindas).toHaveBeenCalledWith({ organizationId: "org-nova", nome: "Dona Maria", email: "dona@clinica.test", linkDeAcesso: LINK });
  });

  it("⭐ deixou de pagar: o plano cai, mas a empresa NÃO é suspensa", async () => {
    const res = await POST(pedido(aviso("subscription_canceled")));
    expect(await corpoDe(res)).toEqual({ resultado: "plano_inativo", organization_id: "org-dela", flows_stopped: 3 });
    expect(h.cairPlano).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dona@clinica.test", motivo: "Assinatura cancelada na Cakto." }),
    );
    expect(h.suspender).not.toHaveBeenCalled();
  });

  it("comprador sem empresa própria (é atendente na de outro): 200 sem efeito, para uma pessoa resolver", async () => {
    h.pagarPlano.mockResolvedValue({ ok: false, motivo: "email_sem_empresa_propria" });
    const res = await POST(pedido(aviso()));
    expect(res.status).toBe(200);
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "email_sem_empresa_propria" });
  });

  it("oferta apontando para plano que o catálogo não tem: não dá plano nenhum, e o erro vai para o log", async () => {
    h.env.CAKTO_SUBSCRIPTION_PRODUCTS = "a8BcHrY=diamante";
    const res = await POST(pedido(aviso()));
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "plano_desconhecido" });
    expect(h.pagarPlano).not.toHaveBeenCalled();
    expect(h.log.error).toHaveBeenCalledTimes(1);
  });

  it("queda de quem não tem plano pago aqui: 200 sem efeito", async () => {
    h.cairPlano.mockResolvedValue({ ok: false, motivo: "empresa_nao_encontrada" });
    const res = await POST(pedido(aviso("refund")));
    expect(await corpoDe(res)).toMatchObject({ resultado: "ignorado", motivo: "empresa_nao_encontrada" });
  });
});
