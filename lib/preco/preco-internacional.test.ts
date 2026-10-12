/**
 * O PREÇO DE QUEM ESCREVE DE FORA DO BRASIL — a regra, o bloco do turno, a troca do link e a trava.
 *
 * O que não pode acontecer, em ordem de gravidade:
 *   1. um número do Brasil ser cobrado em moeda estrangeira (inclusive o guardado sem DDI, que começa com 1);
 *   2. quem está fora receber o link em reais depois de ouvir o valor em euro;
 *   3. a trava de valor mínimo vetar "€ 20" por comparar com o piso em reais.
 */
import { describe, expect, it, vi } from "vitest";

import { linkInternacionalNoLugarDoLink, referenciaDoLinkInternacional } from "@/lib/agent-engine/agent/link-internacional-no-envio";
import { decidePromise } from "@/lib/agent-engine/guardrails/promise/engine";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";

import { tabelaDoTurno } from "./estado-da-negociacao";
import { blocoDoPrecoInternacional, precoInternacionalDoContato, valorNaMoeda } from "./preco-internacional";
import { pricingSchema } from "./tipos";

const CHEIO = "https://pay.exemplo.com.br/cheio_1132655";
const OUTRO = "https://pay.exemplo.com.br/outro_998";
const CEM = "https://pay.exemplo.com.br/b85xwsm";
const PRICING = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13000,
  list_product_links: [
    { name: "Abertura do Coração", url: CHEIO },
    { name: "Limpeza", url: OUTRO },
  ],
  international_prices: [
    { currency: "EUR", price_cents: 2000 },
    { currency: "USD", price_cents: 2500 },
  ],
  steps: [{ price_cents: 10000, product_links: [{ name: "Abertura do Coração", url: CEM }] }],
});
const SO_EURO = pricingSchema.parse({ ...PRICING, international_prices: [{ currency: "EUR", price_cents: 2000 }] });

describe("precoInternacionalDoContato", () => {
  it("⭐ país do euro paga em euro; o resto do mundo, em dólar", () => {
    expect(precoInternacionalDoContato(PRICING, "+351912345678")).toEqual({ moeda: "EUR", precoCents: 2000 });
    expect(precoInternacionalDoContato(PRICING, "+4915123456789")).toEqual({ moeda: "EUR", precoCents: 2000 });
    expect(precoInternacionalDoContato(PRICING, "+12025550123")).toEqual({ moeda: "USD", precoCents: 2500 });
    expect(precoInternacionalDoContato(PRICING, "+447911123456")).toEqual({ moeda: "USD", precoCents: 2500 });
    expect(precoInternacionalDoContato(PRICING, "+5491155551234")).toEqual({ moeda: "USD", precoCents: 2500 });
  });

  it("⭐ número do Brasil segue em reais — e o guardado sem DDI não vira dólar", () => {
    expect(precoInternacionalDoContato(PRICING, "+5518997400209")).toBeNull();
    // "11 9…" sem o +55 começa com 1, o DDI dos Estados Unidos: sem o `+`, não se afirma nada.
    expect(precoInternacionalDoContato(PRICING, "11987654321")).toBeNull();
    expect(precoInternacionalDoContato(PRICING, "351912345678")).toBeNull();
    expect(precoInternacionalDoContato(PRICING, null)).toBeNull();
    expect(precoInternacionalDoContato(PRICING, "+123")).toBeNull();
  });

  it("só uma moeda configurada vale para todo número de fora; nenhuma, ou preço desligado, não muda nada", () => {
    expect(precoInternacionalDoContato(SO_EURO, "+12025550123")).toEqual({ moeda: "EUR", precoCents: 2000 });
    expect(precoInternacionalDoContato(pricingSchema.parse({ enabled: true, list_price_cents: 13000 }), "+351912345678")).toBeNull();
    expect(precoInternacionalDoContato({ ...PRICING, enabled: false }, "+351912345678")).toBeNull();
  });

  it("o schema recusa a mesma moeda duas vezes", () => {
    const r = pricingSchema.safeParse({
      enabled: true,
      list_price_cents: 13000,
      international_prices: [
        { currency: "EUR", price_cents: 2000 },
        { currency: "EUR", price_cents: 2500 },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("blocoDoPrecoInternacional", () => {
  it("diz o valor na moeda, proíbe reais, Pix e desconto, e lista os links do valor de venda", () => {
    const bloco = blocoDoPrecoInternacional(PRICING, { moeda: "EUR", precoCents: 2000 });
    expect(bloco).toContain("€ 20");
    expect(bloco).toContain("NUNCA fale de Pix");
    expect(bloco).toContain("FIXO");
    expect(bloco).toContain(CHEIO);
    // Nenhum valor em reais e nenhum link de degrau: a escada não existe para esta pessoa.
    expect(bloco).not.toMatch(/R\$\s?\d/);
    expect(bloco).not.toContain(CEM);
  });

  it("sem preço internacional no turno, não há bloco", () => {
    expect(blocoDoPrecoInternacional(PRICING, null)).toBe("");
  });

  it("escreve o valor como a pessoa lê", () => {
    expect(valorNaMoeda(2000, "EUR")).toBe("€ 20");
    expect(valorNaMoeda(2550, "USD")).toBe("US$ 25,50");
  });
});

describe("linkInternacionalNoLugarDoLink", () => {
  const log = { info: vi.fn(), warn: vi.fn() };
  const base = {
    pricing: PRICING,
    preco: { moeda: "EUR" as const, precoCents: 2000 },
    organizationId: "org",
    contactId: "contato",
    conversationId: "conversa",
    supabase: {} as never,
    log,
    lerConexao: async () => ({ id: "c", organizationId: "org", chave: "sk_x", segredoDoAviso: "w" }),
    agora: new Date("2026-10-12T12:00:00Z"),
  };

  it("⭐ troca o link em reais pela cobrança na moeda, com o contato nos metadados", async () => {
    const criarLink = vi.fn(async (_c: unknown, _p: unknown) => ({ id: "plink_1", url: "https://buy.exemplo.com/abc" }));
    const saida = await linkInternacionalNoLugarDoLink({ ...base, corpo: `Aqui está:\n\n${CHEIO}`, criarLink });
    expect(saida).toEqual({ corpo: "Aqui está:\n\nhttps://buy.exemplo.com/abc" });
    expect(criarLink.mock.calls[0]![1]).toMatchObject({
      valorCentavos: 2000,
      moeda: "EUR",
      descricao: "Abertura do Coração",
      metadados: { organization_id: "org", contact_id: "contato", conversation_id: "conversa", produto: "Abertura do Coração" },
    });
  });

  it("o link de um degrau também é trocado, e pelo preço FIXO — a escada não vale para quem está fora", async () => {
    const criarLink = vi.fn(async (_c: unknown, _p: unknown) => ({ id: "plink_2", url: "https://buy.exemplo.com/def" }));
    const saida = await linkInternacionalNoLugarDoLink({ ...base, corpo: CEM, criarLink });
    expect(saida).toEqual({ corpo: "https://buy.exemplo.com/def" });
    expect(criarLink.mock.calls[0]![1]).toMatchObject({ valorCentavos: 2000 });
  });

  it("sem link de pagamento no balão, nada muda e ninguém é chamado", async () => {
    const criarLink = vi.fn();
    expect(await linkInternacionalNoLugarDoLink({ ...base, corpo: "Me conta mais.", criarLink })).toEqual({ corpo: "Me conta mais." });
    expect(criarLink).not.toHaveBeenCalled();
  });

  it("⭐ a cobrança não saiu: o envio é RECUSADO — o link em reais nunca chega a quem ouviu o valor em euro", async () => {
    const falha = await linkInternacionalNoLugarDoLink({
      ...base,
      corpo: CHEIO,
      criarLink: async () => {
        throw new ErroDaStripe("indisponivel", "x");
      },
    });
    expect("recusa" in falha && falha.recusa).toContain("NÃO envie link de pagamento em reais");
    const semConta = await linkInternacionalNoLugarDoLink({ ...base, corpo: CHEIO, lerConexao: async () => null, criarLink: vi.fn() });
    expect("recusa" in semConta).toBe(true);
  });

  it("dois links no mesmo envio são recusados: um só, o do produto indicado", async () => {
    const criarLink = vi.fn();
    const saida = await linkInternacionalNoLugarDoLink({ ...base, corpo: `${CHEIO}\n${OUTRO}`, criarLink });
    expect("recusa" in saida).toBe(true);
    expect(criarLink).not.toHaveBeenCalled();
  });

  it("a referência é a mesma no mesmo dia, e muda com o produto, a moeda e o dia", () => {
    const p = { moeda: "EUR" as const, precoCents: 2000 };
    const a = referenciaDoLinkInternacional("c", p, "Abertura do Coração", new Date("2026-10-12T01:00:00Z"));
    expect(referenciaDoLinkInternacional("c", p, "Abertura do Coração", new Date("2026-10-12T23:00:00Z"))).toBe(a);
    expect(referenciaDoLinkInternacional("c", p, "Limpeza", new Date("2026-10-12T01:00:00Z"))).not.toBe(a);
    expect(referenciaDoLinkInternacional("c", { moeda: "USD", precoCents: 2000 }, "Abertura do Coração", new Date("2026-10-12T01:00:00Z"))).not.toBe(a);
    expect(referenciaDoLinkInternacional("c", p, "Abertura do Coração", new Date("2026-10-13T01:00:00Z"))).not.toBe(a);
  });
});

describe("criarLinkDePagamento / lerValorConvertido (contrato com a Stripe)", () => {
  const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

  it("manda moeda, valor, um pagamento só e os metadados na cobrança, com a referência como chave de idempotência", async () => {
    const buscar = vi.fn(async (_url: string, _init: RequestInit) => resposta({ id: "plink_1", url: "https://buy.exemplo.com/abc" }));
    const link = await criarClienteStripe({ chave: "sk_x" }, { fetch: buscar }).criarLinkDePagamento({
      valorCentavos: 2000,
      moeda: "EUR",
      descricao: "Abertura do Coração",
      referencia: "link-c-EUR-2000-1",
      metadados: { contact_id: "contato" },
      mensagemDepoisDePagar: "Pagamento recebido.",
    });
    expect(link).toEqual({ id: "plink_1", url: "https://buy.exemplo.com/abc" });
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_links");
    const campos = new URLSearchParams(String(init.body));
    expect(campos.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(campos.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(campos.get("restrictions[completed_sessions][limit]")).toBe("1");
    expect(campos.get("payment_intent_data[metadata][contact_id]")).toBe("contato");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("link-c-EUR-2000-1");
  });

  it("lê o valor convertido do lançamento; sem lançamento, devolve null em vez de inventar câmbio", async () => {
    const com = criarClienteStripe(
      { chave: "sk_x" },
      { fetch: async () => resposta({ id: "pi_1", latest_charge: { balance_transaction: { amount: 12480, currency: "brl" } } }) },
    );
    expect(await com.lerValorConvertido("pi_1")).toEqual({ valorCentavos: 12480, moeda: "BRL" });
    const sem = criarClienteStripe({ chave: "sk_x" }, { fetch: async () => resposta({ id: "pi_1", latest_charge: { balance_transaction: null } }) });
    expect(await sem.lerValorConvertido("pi_1")).toBeNull();
  });
});

describe("a trava de valor mínimo no turno de quem paga em euro", () => {
  it("⭐ '€ 20' passa com o piso em reais mais alto, e valor abaixo do preço fixo é vetado", () => {
    const tabela = tabelaDoTurno({ minPriceCents: 5000 }, 13000, { moeda: "EUR", cents: 2000 })!;
    expect(decidePromise({ candidate: "O trabalho custa € 20, pagamento único.", table: tabela }).allow).toBe(true);
    expect(decidePromise({ candidate: "Faço por 15 euros.", table: tabela }).allow).toBe(false);
    // O piso em reais continua valendo para valor escrito em reais.
    expect(decidePromise({ candidate: "Faço por R$ 40.", table: tabela }).allow).toBe(false);
  });

  it("sem preço em outra moeda no turno, a tabela é a de sempre", () => {
    expect(tabelaDoTurno({ minPriceCents: 5000 }, 9000)).toEqual({ minPriceCents: 9000 });
    expect(tabelaDoTurno(null, undefined)).toBeNull();
    expect(decidePromise({ candidate: "Faço por 20 euros.", table: { minPriceCents: 5000 } }).allow).toBe(false);
  });
});
