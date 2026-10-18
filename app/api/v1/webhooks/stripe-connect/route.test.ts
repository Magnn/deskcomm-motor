import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Aviso from "@/lib/pagamentos/aviso-de-pagamento-da-stripe";

const SEGREDO = "whsec_plataforma";

const lerAvisoDaContaConectada = vi.fn();
const lerConexaoStripePorConta = vi.fn();
const aplicarAvisoDePagamentoDaStripe = vi.fn();
const update = vi.fn();
const audit = vi.fn();
const checkRateLimit = vi.fn();
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

vi.mock("@/lib/pagamentos/conexao-stripe", () => ({
  lerAvisoDaContaConectada: (...a: unknown[]) => lerAvisoDaContaConectada(...a),
  lerConexaoStripePorConta: (...a: unknown[]) => lerConexaoStripePorConta(...a),
}));
vi.mock("@/lib/pagamentos/aviso-de-pagamento-da-stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof Aviso>()),
  aplicarAvisoDePagamentoDaStripe: (...a: unknown[]) => aplicarAvisoDePagamentoDaStripe(...a),
}));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (valores: unknown) => {
        update(valores);
        const filtro = {
          eq: () => filtro,
          then: (ok: (v: { error: null }) => unknown) => ok({ error: null }),
        };
        return filtro;
      },
    }),
  }),
}));

const { POST } = await import("./route");

function pedido(evento: unknown, segredo = SEGREDO): NextRequest {
  const corpo = JSON.stringify(evento);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", segredo).update(`${t}.${corpo}`, "utf8").digest("hex");
  return new NextRequest("https://app.test/api/v1/webhooks/stripe-connect", {
    method: "POST",
    body: corpo,
    headers: { "stripe-signature": `t=${t},v1=${v1}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  lerAvisoDaContaConectada.mockResolvedValue({
    id: "con-1",
    organizationId: "org-1",
    segredoDoAviso: SEGREDO,
  });
});

describe("aviso da plataforma para as contas conectadas", () => {
  it("assinatura errada não tem efeito nenhum", async () => {
    const r = await POST(
      pedido(
        { type: "account.updated", account: "acct_1", data: { object: { charges_enabled: true } } },
        "whsec_outro",
      ),
    );
    expect(r.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("conta desconhecida responde como assinatura errada", async () => {
    lerAvisoDaContaConectada.mockResolvedValue(null);
    const r = await POST(
      pedido({ type: "payment_intent.succeeded", account: "acct_x", data: { object: {} } }),
    );
    expect(r.status).toBe(401);
    expect(aplicarAvisoDePagamentoDaStripe).not.toHaveBeenCalled();
  });

  it("account.updated grava se a conta já pode receber", async () => {
    const r = await POST(
      pedido({
        type: "account.updated",
        account: "acct_1",
        data: { object: { id: "acct_1", charges_enabled: true } },
      }),
    );
    expect(r.status).toBe(200);
    expect(lerAvisoDaContaConectada).toHaveBeenCalledWith(expect.anything(), "acct_1");
    expect(update).toHaveBeenCalledWith({ stripe_pronta: true });
  });

  it("pagamento vai para o mesmo efeito do aviso por chave colada, com a conexão da conta", async () => {
    const conexao = {
      id: "con-1",
      organizationId: "org-1",
      chave: "sk",
      conta: "acct_1",
      segredoDoAviso: null,
    };
    lerConexaoStripePorConta.mockResolvedValue(conexao);
    aplicarAvisoDePagamentoDaStripe.mockResolvedValue(new Response("{}", { status: 200 }));
    const evento = {
      id: "evt_1",
      type: "payment_intent.succeeded",
      account: "acct_1",
      data: { object: { id: "pi_1" } },
    };
    const r = await POST(pedido(evento));
    expect(r.status).toBe(200);
    expect(aplicarAvisoDePagamentoDaStripe).toHaveBeenCalledWith(
      expect.anything(),
      conexao,
      expect.objectContaining({ id: "evt_1" }),
      expect.any(String),
    );
  });

  it("falha de leitura depois de autenticar pede reentrega, sem perder a venda", async () => {
    lerConexaoStripePorConta.mockResolvedValue(null);
    const r = await POST(
      pedido({ type: "payment_intent.succeeded", account: "acct_1", data: { object: {} } }),
    );
    expect(r.status).toBe(503);
    expect(aplicarAvisoDePagamentoDaStripe).not.toHaveBeenCalled();
  });

  it.each([null, [], "texto", { type: "account.updated", data: { object: null } }])(
    "recusa evento malformado: %j",
    async (evento) => {
      const r = await POST(pedido(evento));
      expect(r.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
      expect(aplicarAvisoDePagamentoDaStripe).not.toHaveBeenCalled();
    },
  );

  it("não muda prontidão quando o objeto é de outra conta", async () => {
    const r = await POST(
      pedido({
        type: "account.updated",
        account: "acct_1",
        data: { object: { id: "acct_outra", charges_enabled: true } },
      }),
    );
    expect(r.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("pede nova tentativa quando passa do limite da conexão autenticada", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const r = await POST(
      pedido({
        type: "account.updated",
        account: "acct_1",
        data: { object: { id: "acct_1", charges_enabled: true } },
      }),
    );
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(update).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("stripe-connect:con-1", 60, 60);
  });
});
