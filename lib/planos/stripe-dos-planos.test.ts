import { describe, expect, it, vi } from "vitest";

import { chaveDoPreco, criarStripeDosPlanos, lerAssinaturaDaStripe, nomeNoExtrato, situacaoDaAssinatura } from "./stripe-dos-planos";

const ORG = "11111111-2222-4333-8444-555555555555";
const PLANO = { id: "pro", nome: "Pro", precoMensalCentavos: 19_700, numeros: 3, iaMensalCentavosUsd: 1_200 };

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

describe("stripe dos planos — regras puras", () => {
  it("a chave do preço muda quando o preço muda", () => {
    expect(chaveDoPreco(PLANO)).toBe("plano_pro_19700");
    expect(chaveDoPreco({ ...PLANO, precoMensalCentavos: 24_700 })).toBe("plano_pro_24700");
  });

  it("só 'active'/'trialing' liberam; 'incomplete' não decide nada", () => {
    expect(situacaoDaAssinatura("active")).toBe("ativa");
    expect(situacaoDaAssinatura("trialing")).toBe("ativa");
    for (const s of ["past_due", "unpaid", "canceled", "incomplete_expired", "paused"]) expect(situacaoDaAssinatura(s)).toBe("inativa");
    expect(situacaoDaAssinatura("incomplete")).toBeNull();
  });

  it("lê empresa, plano (pelo metadado do preço) e cliente da assinatura", () => {
    const a = lerAssinaturaDaStripe({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      metadata: { organization_id: ORG, plan_id: "start" },
      items: { data: [{ id: "si_1", price: { lookup_key: "plano_pro_19700", metadata: { plan_id: "pro" } } }] },
    });
    // O preço cobrado manda sobre o metadado da assinatura (que fica velho depois de uma troca pelo portal).
    expect(a).toEqual({ id: "sub_1", status: "active", clienteId: "cus_1", organizationId: ORG, planoId: "pro", itemId: "si_1" });
  });

  it("sem metadado no preço, o plano sai da lookup_key", () => {
    const a = lerAssinaturaDaStripe({ id: "sub_2", status: "active", items: { data: [{ price: { lookup_key: "plano_scale_39700" } }] } });
    expect(a?.planoId).toBe("scale");
    expect(a?.organizationId).toBeNull();
  });

  it("o nome no extrato segue as regras da Stripe — ou não vai", () => {
    expect(nomeNoExtrato("AcassIA")).toBe("ACASSIA");
    expect(nomeNoExtrato("Clínica São José")).toBe("CLINICA SAO JOSE");
    // Os proibidos da Stripe viram espaço; o limite é 22.
    expect(nomeNoExtrato(`Loja "da" <Ana>*`)).toBe("LOJA DA ANA");
    expect(nomeNoExtrato("Um nome de marca comprido demais")).toBe("UM NOME DE MARCA COMPR");
    // Curto demais, sem letra ou vazio: o produto fica sem o campo (vale o nome da conta).
    expect(nomeNoExtrato("Ana")).toBeNull();
    expect(nomeNoExtrato("123456")).toBeNull();
    expect(nomeNoExtrato("東京ストア")).toBeNull();
    expect(nomeNoExtrato(null)).toBeNull();
  });

  it("objeto que não é assinatura é recusado", () => {
    expect(lerAssinaturaDaStripe({ id: "cs_1" })).toBeNull();
  });
});

describe("stripe dos planos — chamadas", () => {
  it("cria o preço na primeira compra e abre o checkout com a empresa nos metadados", async () => {
    const chamadas: Array<{ url: string; corpo: string }> = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, corpo: String(init.body ?? "") });
      if (url.includes("/prices?")) return resposta({ data: [] });
      if (url.endsWith("/prices")) return resposta({ id: "price_1" });
      return resposta({ url: "https://checkout.stripe.com/c/pay/cs_1" });
    });
    const stripe = criarStripeDosPlanos({ chave: "sk_test_x" }, { fetch });
    const url = await stripe.criarCheckout({
      plano: PLANO,
      organizationId: ORG,
      email: "dono@empresa.com",
      clienteId: null,
      sucesso: "https://app/ok",
      cancelado: "https://app/volta",
    });
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    expect(chamadas[0]!.url).toContain("lookup_keys[]=plano_pro_19700");
    const preco = new URLSearchParams(chamadas[1]!.corpo);
    expect(preco.get("unit_amount")).toBe("19700");
    expect(preco.get("recurring[interval]")).toBe("month");
    expect(preco.get("currency")).toBe("brl");
    // Sem marca informada, o produto não leva nome no extrato (vale o da conta).
    expect(preco.has("product_data[statement_descriptor]")).toBe(false);
    const checkout = new URLSearchParams(chamadas[2]!.corpo);
    expect(checkout.get("mode")).toBe("subscription");
    expect(checkout.get("line_items[0][price]")).toBe("price_1");
    expect(checkout.get("subscription_data[metadata][organization_id]")).toBe(ORG);
    expect(checkout.get("customer_email")).toBe("dono@empresa.com");
  });

  it("o produto do plano leva a marca da instalação como nome no extrato", async () => {
    const corpos: string[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      corpos.push(String(init.body ?? ""));
      return url.includes("/prices?") ? resposta({ data: [] }) : resposta({ id: "price_2" });
    });
    const stripe = criarStripeDosPlanos({ chave: "sk_test_x", marca: "AcassIA" }, { fetch });
    expect(await stripe.precoDoPlano(PLANO)).toBe("price_2");
    expect(new URLSearchParams(corpos[1]!).get("product_data[statement_descriptor]")).toBe("ACASSIA");
  });

  it("reaproveita o preço que já existe", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("/prices?") ? resposta({ data: [{ id: "price_velho" }] }) : resposta({ url: "https://checkout.stripe.com/x" }),
    );
    const stripe = criarStripeDosPlanos({ chave: "sk_test_x" }, { fetch });
    expect(await stripe.precoDoPlano(PLANO)).toBe("price_velho");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
