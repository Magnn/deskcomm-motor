import { describe, expect, it } from "vitest";

import { blocoDaEntrada } from "./bloco-da-entrada";
import { entradaComRestante } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13000,
  steps: [link(10000), link(9000), link(8000), link(7000), link(6000), link(5000)],
});
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });
const PRECO = m("outbound", "O trabalho custa R$ 130, pagamento único.");

describe("entradaComRestante", () => {
  it("⭐ o caso medido: 'tenho apenas 50 reais' e depois 'posso te mandar o restante dia 30'", () => {
    const conversa = [
      PRECO,
      m("inbound", "Desculpa não tenho esse valor"),
      m("inbound", "Tenho apenas 50 reais"),
      m("outbound", "Esse valor de R$ 130 hoje não cabe de jeito nenhum pra você?"),
      m("inbound", "Se vc confiar posso te mandar o restante dia 30"),
    ];
    expect(entradaComRestante(PRICING, conversa)).toEqual({ entradaCents: 5000, restanteCents: 8000 });
  });

  it("a entrada é o maior degrau que cabe no que ela tem, e o restante fecha o valor de venda", () => {
    const com = (texto: string) => entradaComRestante(PRICING, [PRECO, m("inbound", texto)]);
    expect(com("tenho 75 reais hoje e o resto dia 10")).toEqual({ entradaCents: 7000, restanteCents: 6000 });
    expect(com("consigo 80 agora, o restante dia 5")).toEqual({ entradaCents: 8000, restanteCents: 5000 });
    // 100 hoje deixaria 30 de restante, que não é degrau: a maior entrada que fecha é 80.
    expect(com("tenho 100 hoje e o resto dia 20")).toEqual({ entradaCents: 8000, restanteCents: 5000 });
  });

  it("sem data, sem valor, ou com menos que o menor degrau: não é entrada (a escada de sempre segue)", () => {
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "Tenho apenas 50 reais")])).toBeNull();
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "só recebo dia 30")])).toBeNull();
    expect(entradaComRestante(PRICING, [PRECO, m("inbound", "tenho 20 reais hoje e o resto dia 30")])).toBeNull();
    expect(entradaComRestante(PRICING, [m("inbound", "tenho 50 reais e o resto dia 30")])).toBeNull(); // preço ainda não dito
  });
});

describe("blocoDaEntrada", () => {
  it("⭐ manda aceitar, traz o link DO VALOR DA ENTRADA e o restante dito por último", () => {
    const bloco = blocoDaEntrada(PRICING, { entradaCents: 5000, restanteCents: 8000 });
    expect(bloco).toContain("https://pay.exemplo.com.br/v5000");
    expect(bloco).not.toContain("https://pay.exemplo.com.br/v8000");
    expect(bloco).toMatch(/entra com R\$\s?50[^.]*restante de R\$\s?80/);
    expect(bloco).toContain("agendar retorno");
  });

  it("sem entrada, ou sem link para o valor, o bloco não existe", () => {
    expect(blocoDaEntrada(PRICING, null)).toBe("");
    expect(blocoDaEntrada(PRICING, { entradaCents: 4000, restanteCents: 9000 })).toBe("");
    expect(blocoDaEntrada(null, { entradaCents: 5000, restanteCents: 8000 })).toBe("");
  });
});

describe("entradaAPropor — antes do desconto, a agente propõe entrada + restante", () => {
  it("⭐ ela disse quanto tem e não falou de data: propõe a entrada, sem mexer no valor da venda", async () => {
    const { entradaAPropor } = await import("./estado-da-negociacao");
    const conversa = [PRECO, m("inbound", "Desculpa não tenho esse valor"), m("inbound", "Tenho apenas 50 reais")];
    expect(entradaAPropor(PRICING, conversa)).toEqual({ entradaCents: 5000, restanteCents: 8000 });
  });

  it("proposta feita uma vez: se a agente já falou do restante e ela não deu data, a escada segue", async () => {
    const { entradaAPropor } = await import("./estado-da-negociacao");
    const conversa = [
      PRECO,
      m("inbound", "Tenho apenas 50 reais"),
      m("outbound", "Você entra com R$ 50 hoje e o restante de R$ 80 fica para um dia bom. Que dia?"),
      m("inbound", "não vou ter como pagar o resto, só tenho 50 mesmo"),
    ];
    expect(entradaAPropor(PRICING, conversa)).toBeNull();
  });

  it("com a data dita, quem responde é a entrada fechada, não a proposta", async () => {
    const { entradaAPropor } = await import("./estado-da-negociacao");
    const conversa = [PRECO, m("inbound", "tenho 50 reais hoje e o resto dia 30")];
    expect(entradaAPropor(PRICING, conversa)).toBeNull();
    expect(entradaComRestante(PRICING, conversa)).toEqual({ entradaCents: 5000, restanteCents: 8000 });
  });

  it("o bloco manda perguntar o dia e não enviar link ainda", async () => {
    const { blocoDaPropostaDeEntrada } = await import("./bloco-da-entrada");
    const bloco = blocoDaPropostaDeEntrada({ entradaCents: 5000, restanteCents: 8000 });
    expect(bloco).toMatch(/R\$\s?50 hoje e o restante de R\$\s?80/);
    expect(bloco).toContain("Que dia fica bom");
    expect(bloco).toContain("NÃO envie link");
    expect(blocoDaPropostaDeEntrada(null)).toBe("");
  });
});

describe("valorOferecidoParaPagarAgora", () => {
  it("⭐ o caso medido: 'deixa p mim por 80' e 'eu te mando agora' fecha em 80", async () => {
    const { valorOferecidoParaPagarAgora } = await import("./estado-da-negociacao");
    expect(valorOferecidoParaPagarAgora(PRICING, [PRECO, m("inbound", "Deixa p mim por 80"), m("inbound", "Eu te mando agora")])).toBe(8000);
    // O valor aceito é o maior degrau que cabe no que ela ofereceu.
    expect(valorOferecidoParaPagarAgora(PRICING, [PRECO, m("inbound", "pago 85 agora no pix")])).toBe(8000);
  });

  it("⭐ dizer quanto tem, sem se comprometer a pagar agora, segue a escada: não é oferta de compra", async () => {
    const { valorOferecidoParaPagarAgora } = await import("./estado-da-negociacao");
    expect(valorOferecidoParaPagarAgora(PRICING, [PRECO, m("inbound", "só tenho 50 reais")])).toBeNull();
    expect(valorOferecidoParaPagarAgora(PRICING, [PRECO, m("inbound", "deixa por 80")])).toBeNull();
  });

  it("o compromisso tem de estar na rodada atual, e o valor tem de caber num degrau", async () => {
    const { valorOferecidoParaPagarAgora } = await import("./estado-da-negociacao");
    const antiga = [PRECO, m("inbound", "faz por 80 que eu mando agora"), m("outbound", "Dá pra fazer assim: você entra com R$ 80 hoje e o restante depois."), m("inbound", "vou pensar")];
    expect(valorOferecidoParaPagarAgora(PRICING, antiga)).toBeNull();
    expect(valorOferecidoParaPagarAgora(PRICING, [PRECO, m("inbound", "tenho 30, te mando agora")])).toBeNull();
    expect(valorOferecidoParaPagarAgora(PRICING, [m("inbound", "pago 80 agora")])).toBeNull();
  });

  it("o bloco manda fechar no valor aceito e traz o link desse degrau", async () => {
    const { blocoDoValorAceito } = await import("./bloco-da-entrada");
    const bloco = blocoDoValorAceito(PRICING, 8000);
    expect(bloco).toContain("feche em R$ 80");
    expect(bloco).toContain("https://pay.exemplo.com.br/v8000");
    expect(blocoDoValorAceito(PRICING, null)).toBe("");
  });
});
