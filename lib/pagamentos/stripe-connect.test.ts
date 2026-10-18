import { describe, expect, it, vi } from "vitest";

import { criarAvisoDaPlataforma, criarClienteStripe, taxaDaPlataforma } from "./stripe";
import { criarStripeConnect } from "./stripe-connect";

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Chamada = { url: string; corpo: URLSearchParams; cabecalhos: Record<string, string> };

function gravador(corpo: (url: string) => unknown) {
  const chamadas: Chamada[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    chamadas.push({
      url,
      corpo: new URLSearchParams(String(init.body ?? "")),
      cabecalhos: (init.headers ?? {}) as Record<string, string>,
    });
    return resposta(corpo(url));
  });
  return { chamadas, fetch };
}

const PIX = {
  next_action: {
    pix_display_qr_code: { data: "000201abc", image_url_png: null, expires_at: 1_800_000_000 },
  },
  id: "pi_1",
};
const PEDIDO = {
  valorCentavos: 6000,
  descricao: "Leitura",
  referencia: "ref-1",
  metadados: { contact_id: "c" },
  expiraEmSegundos: 3600,
};

describe("taxa da plataforma", () => {
  it("só vai com conta conectada, positiva e menor que o valor", () => {
    expect(taxaDaPlataforma({ chave: "sk", conta: "acct_1", taxaCentavos: 99 }, 6000)).toBe(99);
    expect(taxaDaPlataforma({ chave: "sk", taxaCentavos: 99 }, 6000)).toBeNull(); // chave colada: sem taxa
    expect(taxaDaPlataforma({ chave: "sk", conta: "acct_1", taxaCentavos: 0 }, 6000)).toBeNull();
    // A Stripe recusa taxa igual ou maior que a cobrança — e a cobrança inteira cairia.
    expect(taxaDaPlataforma({ chave: "sk", conta: "acct_1", taxaCentavos: 99 }, 99)).toBeNull();
    expect(taxaDaPlataforma({ chave: "sk", conta: "acct_1", taxaCentavos: 99 }, 50)).toBeNull();
  });
});

describe("cobrança na conta conectada", () => {
  it("o Pix nasce na conta da empresa, com a taxa da plataforma", async () => {
    const { chamadas, fetch } = gravador(() => PIX);
    await criarClienteStripe(
      { chave: "sk_live_instalacao", conta: "acct_empresa", taxaCentavos: 99 },
      { fetch },
    ).criarPix(PEDIDO);
    expect(chamadas[0]!.cabecalhos["Stripe-Account"]).toBe("acct_empresa");
    expect(chamadas[0]!.cabecalhos.Authorization).toBe("Bearer sk_live_instalacao");
    expect(chamadas[0]!.corpo.get("application_fee_amount")).toBe("99");
  });

  it("com a chave colada da empresa, nada muda: sem cabeçalho e sem taxa", async () => {
    const { chamadas, fetch } = gravador(() => PIX);
    await criarClienteStripe({ chave: "sk_live_da_empresa" }, { fetch }).criarPix(PEDIDO);
    expect(chamadas[0]!.cabecalhos["Stripe-Account"]).toBeUndefined();
    expect(chamadas[0]!.corpo.has("application_fee_amount")).toBe(false);
  });

  it("o link de pagamento em reais também leva a taxa", async () => {
    const { chamadas, fetch } = gravador(() => ({
      id: "plink_1",
      url: "https://buy.stripe.com/x",
    }));
    await criarClienteStripe(
      { chave: "sk", conta: "acct_empresa", taxaCentavos: 99 },
      { fetch },
    ).criarLinkDePagamento({
      valorCentavos: 2500,
      moeda: "BRL",
      descricao: "Reading",
      referencia: "ref-2",
      metadados: {},
      mensagemDepoisDePagar: "ok",
    });
    expect(chamadas[0]!.url).toContain("/payment_links");
    expect(chamadas[0]!.corpo.get("application_fee_amount")).toBe("99");
    expect(chamadas[0]!.cabecalhos["Stripe-Account"]).toBe("acct_empresa");
  });

  it.each(["USD", "EUR"])("não interpreta a taxa em reais como centavos de %s", async (moeda) => {
    const { chamadas, fetch } = gravador(() => ({
      id: "plink_1",
      url: "https://buy.stripe.com/x",
    }));
    await criarClienteStripe(
      { chave: "sk", conta: "acct_empresa", taxaCentavos: 99 },
      { fetch },
    ).criarLinkDePagamento({
      valorCentavos: 2500,
      moeda,
      descricao: "Reading",
      referencia: "ref-2",
      metadados: {},
      mensagemDepoisDePagar: "ok",
    });
    expect(chamadas[0]!.corpo.has("application_fee_amount")).toBe(false);
    expect(chamadas[0]!.cabecalhos["Stripe-Account"]).toBe("acct_empresa");
  });
});

describe("conectar com stripe", () => {
  it("cria a conta da empresa com Dashboard completo — reembolso e contestação ficam com ela", async () => {
    const { chamadas, fetch } = gravador(() => ({
      id: "acct_novo",
      charges_enabled: false,
      details_submitted: false,
    }));
    const conta = await criarStripeConnect({ chave: "sk" }, { fetch }).criarConta({
      organizationId: "org-1",
      email: "dono@x.com",
      nome: "Loja",
    });
    expect(conta).toEqual({
      id: "acct_novo",
      pronta: false,
      cadastroEnviado: false,
      pixAtivo: false,
    });
    const c = chamadas[0]!;
    expect(c.url).toMatch(/\/accounts$/);
    expect(c.cabecalhos["Stripe-Account"]).toBeUndefined(); // a criação é da plataforma
    expect(c.cabecalhos["Idempotency-Key"]).toBe("conta-conectada-org-1");
    expect(c.corpo.get("country")).toBe("BR");
    expect(c.corpo.get("controller[stripe_dashboard][type]")).toBe("full");
    expect(c.corpo.get("controller[fees][payer]")).toBe("account");
    expect(c.corpo.get("controller[losses][payments]")).toBe("stripe");
    expect(c.corpo.get("metadata[organization_id]")).toBe("org-1");
  });

  it("abre o cadastro e lê a situação da conta", async () => {
    const { chamadas, fetch } = gravador((url) =>
      url.includes("/account_links")
        ? { url: "https://connect.stripe.com/setup/x" }
        : {
            id: "acct_1",
            charges_enabled: true,
            details_submitted: true,
            capabilities: { pix_payments: "active" },
          },
    );
    const connect = criarStripeConnect({ chave: "sk" }, { fetch });
    expect(
      await connect.linkDeCadastro("acct_1", { voltar: "https://a/v", renovar: "https://a/r" }),
    ).toBe("https://connect.stripe.com/setup/x");
    expect(chamadas[0]!.corpo.get("type")).toBe("account_onboarding");
    expect(chamadas[0]!.corpo.get("return_url")).toBe("https://a/v");
    expect(await connect.lerConta("acct_1")).toEqual({
      id: "acct_1",
      pronta: true,
      cadastroEnviado: true,
      pixAtivo: true,
    });
  });

  it("o aviso da plataforma é registrado com connect=true e devolve o segredo", async () => {
    const { chamadas, fetch } = gravador(() => ({ id: "we_1", secret: "whsec_x" }));
    expect(
      await criarAvisoDaPlataforma({ chave: "sk" }, "https://a/api/v1/webhooks/stripe-connect", {
        fetch,
      }),
    ).toEqual({ id: "we_1", segredo: "whsec_x" });
    expect(chamadas[0]!.corpo.get("connect")).toBe("true");
    expect(chamadas[0]!.corpo.get("enabled_events[0]")).toBe("payment_intent.succeeded");
    expect(chamadas[0]!.corpo.get("enabled_events[1]")).toBe("account.updated");
    expect(chamadas[0]!.cabecalhos["Idempotency-Key"]).toMatch(/^aviso-connect-[a-f0-9]{64}$/);
    await criarAvisoDaPlataforma({ chave: "sk" }, "https://a/api/v1/webhooks/stripe-connect", {
      fetch,
    });
    expect(chamadas[1]!.cabecalhos["Idempotency-Key"]).toBe(
      chamadas[0]!.cabecalhos["Idempotency-Key"],
    );
  });
});
