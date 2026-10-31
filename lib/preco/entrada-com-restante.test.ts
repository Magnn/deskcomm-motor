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

describe("entradaImediata — o Pix no valor que a pessoa disse", () => {
  it("⭐ o caso medido: 'só tenho 90 no Pix' é entrada de R$ 90 e restante de R$ 40, sem arredondar para degrau", async () => {
    const { entradaImediata } = await import("./estado-da-negociacao");
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "Mais eu vi só tenho 90 no Pix")])).toEqual({ entradaCents: 9000, restanteCents: 4000 });
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "não tenho esse valor"), m("inbound", "consigo 75 hoje")])).toEqual({ entradaCents: 7500, restanteCents: 5500 });
  });

  it("⭐ abaixo da entrada mínima, igual ou acima do valor de venda, e valor dito em rodada antiga: não é entrada agora", async () => {
    const { entradaImediata } = await import("./estado-da-negociacao");
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "só tenho 20")])).toBeNull();
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "tenho 130")])).toBeNull();
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "só tenho 90"), m("outbound", "Fechado, entra com R$ 90."), m("inbound", "ok")])).toBeNull();
    expect(entradaImediata(PRICING, [m("inbound", "só tenho 90")])).toBeNull();
  });

  it("a entrada mínima é a configurada; sem ela, o menor degrau; sem degrau nem mínimo, não há entrada", async () => {
    const { entradaImediata } = await import("./estado-da-negociacao");
    const conversa = [PRECO, m("inbound", "só tenho 30")];
    // Abaixo do menor degrau, a primeira vez não é entrada: a agente segura o menor valor (decisão do dono, 12/10).
    expect(entradaImediata({ ...PRICING, min_down_payment_cents: 3000 }, conversa)).toBeNull();
    const segurou = [...conversa, m("outbound", "O menor valor é R$ 50. Você consegue completar hoje?")];
    const comMinimo = { ...PRICING, min_down_payment_cents: 3000 };
    expect(entradaImediata(comMinimo, [...segurou, m("inbound", "não consigo, é o que eu tenho")])).toEqual({ entradaCents: 3000, restanteCents: 10000 });
    expect(entradaImediata(comMinimo, [...segurou, m("inbound", "só tenho 35")])).toEqual({ entradaCents: 3500, restanteCents: 9500 });
    // Ela conseguiu o menor valor: não é entrada abaixo do piso, segue a regra de sempre.
    expect(entradaImediata(comMinimo, [...segurou, m("inbound", "vou ver com meu tio")])).toBeNull();
    expect(entradaImediata(comMinimo, [...segurou, m("inbound", "só tenho 20")])).toBeNull();
    expect(entradaImediata(PRICING, conversa)).toBeNull();
    expect(entradaImediata({ list_price_cents: 13000, steps: [] }, [PRECO, m("inbound", "só tenho 90")])).toBeNull();
  });

  it("o bloco manda aceitar o valor exato, mandar a marca e só depois perguntar a data", async () => {
    const { blocoDaEntradaImediata } = await import("./bloco-da-entrada");
    const bloco = blocoDaEntradaImediata({ entradaCents: 9000, restanteCents: 4000 });
    expect(bloco).toContain("R$ 90");
    expect(bloco).toContain("R$ 40");
    expect(bloco).toContain("[[PIX: Entrada]]");
    expect(bloco).toContain("NÃO arredonde");
    expect(blocoDaEntradaImediata(null)).toBe("");
  });

  it("⭐ a marca vira o Pix do valor da entrada, com os metadados do produto; se a cobrança falhar, o envio é recusado", async () => {
    const { pixDaEntradaNoLugarDaMarca } = await import("@/lib/agent-engine/agent/pix-da-entrada-no-envio");
    const codigo = "00020101021226740014br.gov.bcb.pix2552pix.exemplo.com/qr/v2/ABC5204000053039865802BR5925Empresa de Pagamentos6009SAO PAULO6304ABCD";
    const base = {
      corpo: "Fechado: você entra com R$ 90 agora.\n\n[[PIX: Entrada]]\n\nConseguiu copiar o código?",
      entrada: { entradaCents: 9000, restanteCents: 4000 },
      produto: "Abertura do Coração",
      organizationId: "org",
      contactId: "contato",
      conversationId: "conversa",
      supabase: {} as never,
      log: { info: () => undefined, warn: () => undefined },
      lerConexao: async () => ({ id: "c", organizationId: "org", chave: "sk_x", segredoDoAviso: "w" }),
    };
    const pedidos: unknown[] = [];
    const saida = await pixDaEntradaNoLugarDaMarca({
      ...base,
      criarPix: async (_c, p) => {
        pedidos.push(p);
        return { id: "pi_1", copiaECola: codigo, qrPng: null, expiraEm: null };
      },
    });
    const corpo = "corpo" in saida ? saida.corpo : "";
    expect(corpo).toContain(codigo);
    expect(corpo).toContain("*R$ 90*");
    expect(corpo).not.toContain("[[");
    expect(pedidos[0]).toMatchObject({ valorCentavos: 9000, metadados: { contact_id: "contato", produto: "Abertura do Coração", entrada: "sim", restante_cents: "4000" } });
    expect((pedidos[0] as { metadados: Record<string, string> }).metadados.extra).toBeUndefined();
    const falhou = await pixDaEntradaNoLugarDaMarca({ ...base, criarPix: async () => { throw new Error("fora"); } });
    expect("recusa" in falhou).toBe(true);
    expect(await pixDaEntradaNoLugarDaMarca({ ...base, corpo: "Me conta mais.", criarPix: async () => { throw new Error("não devia chamar"); } })).toEqual({ corpo: "Me conta mais." });
  });
});

describe("valor abaixo do menor valor — a agente segura antes de aceitar entrada", () => {
  it("⭐ o caso medido: disse 30, a agente segura o menor valor; só na volta o valor vira entrada", async () => {
    const { valorAbaixoDoPisoAgora } = await import("./estado-da-negociacao");
    const { blocoDoValorAbaixoDoPiso } = await import("./bloco-da-entrada");
    const piso = Math.min(...PRICING.steps.map((s) => s.price_cents));
    const primeira = [PRECO, m("inbound", "só tenho 30")];
    expect(valorAbaixoDoPisoAgora(PRICING, primeira)).toEqual({ ditoCents: 3000, pisoCents: piso });
    const bloco = blocoDoValorAbaixoDoPiso({ ditoCents: 3000, pisoCents: piso });
    expect(bloco).toContain("NÃO se despeça");
    expect(blocoDoValorAbaixoDoPiso(null)).toBe("");
    // Segunda vez: não segura de novo.
    expect(valorAbaixoDoPisoAgora(PRICING, [...primeira, m("outbound", "O menor é esse."), m("inbound", "só tenho 30 mesmo")])).toBeNull();
    // Valor no piso ou acima não entra aqui.
    expect(valorAbaixoDoPisoAgora(PRICING, [PRECO, m("inbound", "só tenho 90")])).toBeNull();
  });
});

describe("o número sozinho que responde 'quanto caberia pra você?' (30/10/2026)", () => {
  const PERGUNTOU = m("outbound", "Eu sei que não está fácil, Carla. Me diz uma coisa, sem aperto: hoje, pro trabalho que a gente viu, quanto caberia de verdade pra você sem tirar o que é da casa?");

  it("⭐ o caso medido: 'estou sem recursos' → a agente pergunta quanto cabe → '80' vira entrada de 80 e restante de 50", async () => {
    const { entradaImediata } = await import("./estado-da-negociacao");
    const conversa = [PRECO, m("inbound", "Esmeralda estou sem recursos para fazer agora"), PERGUNTOU, m("inbound", "80")];
    expect(entradaImediata(PRICING, conversa)).toEqual({ entradaCents: 8000, restanteCents: 5000 });
  });

  it("⭐ o lembrete do Pix vencido (31/10): ela calou depois do preço, a régua pergunta quanto cabe, '80' vira entrada", async () => {
    const { entradaImediata } = await import("./estado-da-negociacao");
    const lembrete = m("outbound", "Carla, o código do Pix venceu. Dá pra começar com uma parte e acertar o restante depois: quanto cabe pra você hoje?");
    expect(entradaImediata(PRICING, [PRECO, lembrete, m("inbound", "80")])).toEqual({ entradaCents: 8000, restanteCents: 5000 });
  });

  it("aceita 'R$ 80', '80,00' e '80 reais' sozinhos", async () => {
    const { valorQueAPessoaTem } = await import("./estado-da-negociacao");
    for (const resposta of ["R$ 80", "80,00", "80 reais", "80."]) {
      expect(valorQueAPessoaTem([PRECO, PERGUNTOU, m("inbound", resposta)])).toBe(8000);
    }
  });

  it("número sozinho sem a pergunta do valor não é dinheiro (data, idade, número das cartas)", async () => {
    const { valorQueAPessoaTem } = await import("./estado-da-negociacao");
    expect(valorQueAPessoaTem([PRECO, m("outbound", "Escolha um número de 1 a 22."), m("inbound", "20")])).toBeNull();
    expect(valorQueAPessoaTem([PRECO, m("outbound", "Quantos anos ele tem?"), m("inbound", "75")])).toBeNull();
  });

  it("o bloco da entrada proíbe oferecer pergunta nova no mesmo turno", async () => {
    const { blocoDaEntradaImediata } = await import("./bloco-da-entrada");
    expect(blocoDaEntradaImediata({ entradaCents: 8000, restanteCents: 5000 })).toMatch(/NÃO ofereça pergunta nova/);
  });
});
