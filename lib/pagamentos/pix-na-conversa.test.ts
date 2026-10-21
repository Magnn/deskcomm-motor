import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ehCodigoDoPix, splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";
import { pixNoLugarDoLink } from "@/lib/agent-engine/agent/pix-no-envio";
import { pricingSchema } from "@/lib/preco/tipos";

import { corpoComPix, linkDePagamentoNoCorpo, linksDePagamentoDaConfig, referenciaDoPix } from "./pix-na-conversa";
import { ErroDaStripe, assinaturaDaStripeConfere, corpoDaStripe, criarClienteStripe } from "./stripe";

const CHEIO = "https://pay.exemplo.com.br/cheio_1132655";
const CEM = "https://pay.exemplo.com.br/b85xwsm";
const NOVENTA = "https://pay.exemplo.com.br/3edxm2f";
const PRICING = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13000,
  list_product_links: [{ name: "Abertura do Coração", url: CHEIO }],
  steps: [
    { price_cents: 10000, product_links: [{ name: "Abertura do Coração", url: CEM }] },
    { price_cents: 9000, product_links: [{ name: "Abertura do Coração", url: NOVENTA }] },
  ],
});
// Um código real tem espaço no meio (o nome de quem recebe) e passa do limite de um balão.
const CODIGO =
  "00020101021226880014br.gov.bcb.pix2566qrcodes-pix.exemplo.com/v2/cobv/9d36b84fc70b478fb95c12729b90ca25" +
  "5204000053039865802BR5924ARCANUM IMPERIUM DIGITAL6009SAO PAULO62070503***6304A1B2" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

describe("linksDePagamentoDaConfig / linkDePagamentoNoCorpo", () => {
  const conhecidos = linksDePagamentoDaConfig(PRICING);

  it("⭐ cada link da configuração sabe o valor e o produto que cobra — inclusive o do valor cheio", () => {
    expect(conhecidos).toEqual([
      { url: CHEIO, valorCentavos: 13000, produto: "Abertura do Coração" },
      { url: CEM, valorCentavos: 10000, produto: "Abertura do Coração" },
      { url: NOVENTA, valorCentavos: 9000, produto: "Abertura do Coração" },
    ]);
    expect(linksDePagamentoDaConfig(null)).toEqual([]);
  });

  it("o valor do Pix é o do link que o agente escolheu — é a negociação que decide, não o modelo", () => {
    expect(linkDePagamentoNoCorpo(`É por este link:\n\n${CEM}\n\nConseguiu abrir?`, conhecidos)?.valorCentavos).toBe(10000);
    expect(linkDePagamentoNoCorpo(`${NOVENTA}`, conhecidos)?.valorCentavos).toBe(9000);
  });

  it("link desconhecido, nenhum link, ou dois valores no mesmo envio: não vira Pix", () => {
    expect(linkDePagamentoNoCorpo("https://outro.site/abc", conhecidos)).toBeNull();
    expect(linkDePagamentoNoCorpo("Oi, meu bem.", conhecidos)).toBeNull();
    expect(linkDePagamentoNoCorpo(`${CEM}\n\n${NOVENTA}`, conhecidos)).toBeNull();
    // um link que só COMEÇA igual a um conhecido não é o conhecido
    expect(linkDePagamentoNoCorpo(`${CEM}xyz`, conhecidos)).toBeNull();
  });
});

describe("corpoComPix", () => {
  const link = { url: CEM, valorCentavos: 10000, produto: "Abertura do Coração" };

  it("⭐ o balão do link vira instrução + código sozinho + link para cartão; o resto fica como estava", () => {
    const corpo = corpoComPix(`Que bênção, meu bem!\n\n${CEM}\n\nConseguiu abrir o link?`, link, CODIGO);
    const baloes = corpo.split("\n\n");
    expect(baloes[0]).toBe("Que bênção, meu bem!");
    expect(baloes[1]).toContain("Pix Copia e Cola");
    expect(baloes[1]).toMatch(/R\$\s?100/);
    expect(baloes[2]).toBe(CODIGO);
    expect(baloes[3]).toBe(`Se preferir cartão, é por este link: ${CEM}`);
    expect(baloes[4]).toBe("Conseguiu abrir o link?");
  });

  it("corpo sem o link volta igual", () => {
    expect(corpoComPix("Oi.", link, CODIGO)).toBe("Oi.");
  });
});

describe("o corte de balões nunca parte nem cola o código do Pix", () => {
  it("⭐ o código vai inteiro num balão só, mesmo passando do limite e tendo espaço no meio", () => {
    expect(CODIGO.length).toBeGreaterThan(250);
    const baloes = splitIntoBubbles(`Copia o código abaixo.\n\n${CODIGO}\n\nSe preferir cartão, é por este link: ${CEM}`, 250);
    expect(baloes).toEqual(["Copia o código abaixo.", CODIGO, `Se preferir cartão, é por este link: ${CEM}`]);
  });

  it("código curto não é colado na frase vizinha", () => {
    const curto = CODIGO.slice(0, 120);
    expect(splitIntoBubbles(`Oi.\n\n${curto}\n\nTchau.`, 250)).toEqual(["Oi.", curto, "Tchau."]);
  });

  it("texto comum segue o corte de sempre", () => {
    expect(ehCodigoDoPix("000201 não é código")).toBe(false);
    expect(splitIntoBubbles("Oi.\n\nTudo bem?", 250)).toEqual(["Oi.\n\nTudo bem?"]);
  });
});

describe("pixNoLugarDoLink — a ponta que fala com o provedor", () => {
  const base = {
    pricing: PRICING,
    organizationId: "11111111-1111-4111-8111-111111111111",
    contactId: "22222222-2222-4222-8222-222222222222",
    conversationId: "33333333-3333-4333-8333-333333333333",
    supabase: {} as never,
    log: { info: () => {}, warn: () => {} },
    agora: new Date("2026-10-11T22:00:00Z"),
  };
  const conexao = { id: "c1", organizationId: base.organizationId, chave: "sk_x", segredoDoAviso: "whsec_x" };

  it("⭐ com conta conectada, cobra o valor do link e manda quem é a pessoa nos metadados", async () => {
    const pedidos: unknown[] = [];
    const corpo = await pixNoLugarDoLink({
      ...base,
      corpo: `É por aqui:\n\n${NOVENTA}`,
      lerConexao: async () => conexao,
      criarPix: async (_c, p) => {
        pedidos.push(p);
        return { id: "pi_1", copiaECola: CODIGO, qrPng: null, expiraEm: null };
      },
    });
    expect(corpo).toContain(CODIGO);
    expect(pedidos).toEqual([
      expect.objectContaining({
        valorCentavos: 9000,
        referencia: referenciaDoPix(base.conversationId, 9000, base.agora),
        metadados: expect.objectContaining({ organization_id: base.organizationId, contact_id: base.contactId, produto: "Abertura do Coração" }),
      }),
    ]);
  });

  it("⭐ a Stripe falhou: a pessoa recebe o link de sempre, e nada lança", async () => {
    const corpo = `É por aqui:\n\n${CEM}`;
    const saida = await pixNoLugarDoLink({
      ...base,
      corpo,
      lerConexao: async () => conexao,
      criarPix: async () => {
        throw new ErroDaStripe("pix_indisponivel", "pix não ativo");
      },
    });
    expect(saida).toBe(corpo);
  });

  it("sem conta conectada, ou sem link conhecido, nem chama o provedor", async () => {
    let chamou = 0;
    const criarPix = async () => {
      chamou += 1;
      return { id: "x", copiaECola: CODIGO, qrPng: null, expiraEm: null };
    };
    expect(await pixNoLugarDoLink({ ...base, corpo: CEM, lerConexao: async () => null, criarPix })).toBe(CEM);
    expect(await pixNoLugarDoLink({ ...base, corpo: "Oi.", lerConexao: async () => conexao, criarPix })).toBe("Oi.");
    expect(chamou).toBe(0);
  });

  it("a mesma conversa pedindo o mesmo valor na mesma hora usa a mesma referência (não cobra em dobro)", () => {
    const a = referenciaDoPix("c", 9000, new Date("2026-10-11T22:05:00Z"));
    expect(referenciaDoPix("c", 9000, new Date("2026-10-11T22:55:00Z"))).toBe(a);
    expect(referenciaDoPix("c", 8000, new Date("2026-10-11T22:05:00Z"))).not.toBe(a);
  });
});

describe("cliente da Stripe", () => {
  it("⭐ cria o Pix confirmado, com idempotência, e devolve o copia e cola", async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    const cliente = criarClienteStripe(
      { chave: "sk_teste" },
      {
        fetch: async (url, init) => {
          chamadas.push({ url, init });
          return new Response(
            JSON.stringify({ id: "pi_9", next_action: { pix_display_qr_code: { data: CODIGO, image_url_png: "https://q/x.png", expires_at: 1791759600 } } }),
            { status: 200 },
          );
        },
      },
    );
    const pix = await cliente.criarPix({ valorCentavos: 9000, descricao: "Abertura", referencia: "ref-1", metadados: { contact_id: "c" }, expiraEmSegundos: 3600 });
    expect(pix).toEqual({ id: "pi_9", copiaECola: CODIGO, qrPng: "https://q/x.png", expiraEm: new Date(1791759600 * 1000).toISOString() });
    const { url, init } = chamadas[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("ref-1");
    const corpo = new URLSearchParams(String(init.body));
    expect(corpo.get("amount")).toBe("9000");
    expect(corpo.get("currency")).toBe("brl");
    expect(corpo.get("payment_method_types[0]")).toBe("pix");
    expect(corpo.get("confirm")).toBe("true");
    expect(corpo.get("metadata[contact_id]")).toBe("c");
  });

  it("chave recusada e conta sem Pix viram erros com nome", async () => {
    const com = (status: number, mensagem: string) =>
      criarClienteStripe({ chave: "sk" }, { fetch: async () => new Response(JSON.stringify({ error: { message: mensagem } }), { status }) });
    await expect(com(401, "Invalid API Key").lerConta()).rejects.toMatchObject({ codigo: "chave_invalida" });
    await expect(
      com(400, "The payment method type pix is invalid. Please ensure the provided type is activated in your dashboard").criarPix({
        valorCentavos: 1, descricao: "x", referencia: "r", metadados: {}, expiraEmSegundos: 60,
      }),
    ).rejects.toMatchObject({ codigo: "pix_indisponivel" });
    await expect(com(503, "x").lerConta()).rejects.toMatchObject({ codigo: "indisponivel" });
  });

  it("corpoDaStripe codifica as chaves aninhadas", () => {
    expect(corpoDaStripe({ "metadata[a b]": "x&y", amount: 1 })).toBe("metadata%5Ba%20b%5D=x%26y&amount=1");
  });
});

describe("assinaturaDaStripeConfere", () => {
  const segredo = "whsec_teste";
  const corpo = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const agora = new Date("2026-10-11T22:00:00Z");
  const t = Math.floor(agora.getTime() / 1000);
  const assinar = (carimbo: number, texto = corpo, s = segredo) => `t=${carimbo},v1=${createHmac("sha256", s).update(`${carimbo}.${texto}`).digest("hex")}`;

  it("⭐ aceita a assinatura certa e recusa corpo trocado, segredo errado e carimbo velho", () => {
    expect(assinaturaDaStripeConfere(corpo, assinar(t), segredo, agora)).toBe(true);
    expect(assinaturaDaStripeConfere(corpo.replace("evt_1", "evt_2"), assinar(t), segredo, agora)).toBe(false);
    expect(assinaturaDaStripeConfere(corpo, assinar(t, corpo, "outro"), segredo, agora)).toBe(false);
    expect(assinaturaDaStripeConfere(corpo, assinar(t - 3600), segredo, agora)).toBe(false);
    expect(assinaturaDaStripeConfere(corpo, null, segredo, agora)).toBe(false);
    expect(assinaturaDaStripeConfere(corpo, "v1=abc", segredo, agora)).toBe(false);
  });
});

describe("mensagem única (economia de mensagem cobrada) com código do Pix", () => {
  it("⭐ o código sai sozinho mesmo quando a resposta não é dividida em balões", async () => {
    const { splitForSend } = await import("@/lib/agent-engine/agent/split-message");
    const corpo = `Claro, Wilson.\n\nO trabalho custa R$ 130.\n\nCopia o código abaixo.\n\n${CODIGO}\n\nSe preferir cartão: ${CEM}\n\nMe manda o comprovante.`;
    expect(splitForSend(corpo, false, 250)).toEqual([
      "Claro, Wilson.\n\nO trabalho custa R$ 130.\n\nCopia o código abaixo.",
      CODIGO,
      `Se preferir cartão: ${CEM}\n\nMe manda o comprovante.`,
    ]);
  });

  it("sem código do Pix, a mensagem única continua única", async () => {
    const { splitForSend } = await import("@/lib/agent-engine/agent/split-message");
    expect(splitForSend("Oi.\n\nTudo bem?", false, 250)).toEqual(["Oi.\n\nTudo bem?"]);
  });
});

describe("cobrança nova depois de um pagamento", () => {
  it("a referência muda quando já houve pagamento: o Pix e o link novos não são os já usados", async () => {
    const { pagamentosRecentesDoContato } = await import("./pix-na-conversa");
    const agora = new Date("2026-10-21T16:05:00Z");
    expect(referenciaDoPix("c", 500, agora, 1)).not.toBe(referenciaDoPix("c", 500, agora));
    expect(referenciaDoPix("c", 500, agora, 0)).toBe(referenciaDoPix("c", 500, agora));
    const banco = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: 2, error: null }) }) }) }) }),
      }),
    };
    expect(await pagamentosRecentesDoContato(banco, "o", "c", agora)).toBe(2);
    expect(await pagamentosRecentesDoContato({ from: () => { throw new Error("x"); } }, "o", "c", agora)).toBe(0);
  });
});
