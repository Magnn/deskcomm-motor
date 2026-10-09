/**
 * PREÇO E NEGOCIAÇÃO — o que a agente pode prometer, e o que a trava garante.
 *
 * O que estes testes seguram:
 *  - a configuração recusa o que faria a agente prometer algo que o checkout não cobra
 *    (degrau sem cupom nem link) ou anunciar desconto falso (referência sem declaração,
 *    referência menor que a venda, degraus fora de ordem);
 *  - o bloco de prompt diz o MÍNIMO e a ordem dos degraus, e some quando desligado;
 *  - o piso vira `minPriceCents` na trava de promessas — e a trava vetaria de fato o valor
 *    abaixo dele (a rede de segurança, ponta a ponta com a função real de decisão);
 *  - a sincronização preserva o que a tabela já tinha e não é do preço.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decidePromise } from "@/lib/agent-engine/guardrails/promise/engine";
import { blocoDePreco, semObjecaoDePrecoQuandoHaBloco } from "@/lib/preco/bloco-do-prompt";
import {
  degrauQueFaltaOferecerAntesDeAgendar,
  deuDataParaPagar,
  estadoDaNegociacao,
  faltaParaOEssencial,
  expandirHistoricoColado,
  precoPermitidoAgora,
  reclamacoesDeValor,
  tabelaDoTurno,
  valorQueAPessoaTem,
} from "@/lib/preco/estado-da-negociacao";
import { sincronizarPiso, tabelaDoPiso } from "@/lib/preco/sincronizar-piso";
import { lerPricing, pisoEmCentavos, pricingSchema, reais } from "@/lib/preco/tipos";

const BASE = { enabled: true, list_price_cents: 13_000 };
const COM_DEGRAUS = {
  ...BASE,
  anchor_price_cents: 26_000,
  anchor_is_real: true,
  steps: [
    { price_cents: 11_000, coupon_code: "CUPOM110" },
    { price_cents: 10_000, payment_url: "https://pay.cakto.com.br/abc_100" },
  ],
};

describe("pricingSchema", () => {
  it("aceita só o valor de venda — sem negociação e sem referência", () => {
    expect(pricingSchema.safeParse(BASE).success).toBe(true);
  });

  it("aceita referência declarada como real e degraus em ordem decrescente", () => {
    expect(pricingSchema.safeParse(COM_DEGRAUS).success).toBe(true);
  });

  it("referência SEM a declaração de que é real é recusada", () => {
    const r = pricingSchema.safeParse({ ...BASE, anchor_price_cents: 26_000 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("anchor_is_real");
  });

  it("referência tem de ser MAIOR que a venda (senão não é âncora, é acréscimo)", () => {
    expect(pricingSchema.safeParse({ ...BASE, anchor_price_cents: 13_000, anchor_is_real: true }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...BASE, anchor_price_cents: 9_000, anchor_is_real: true }).success).toBe(false);
  });

  it("degrau sem cupom nem link é recusado: valor sem forma de pagar não pode ser oferecido", () => {
    const r = pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 11_000 }] });
    expect(r.success).toBe(false);
  });

  it("link do degrau precisa ser https; cupom, só letras, números, - e _", () => {
    expect(pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 11_000, payment_url: "http://x.com/a" }] }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 11_000, coupon_code: "com espaço" }] }).success).toBe(false);
  });

  it("degraus têm de descer: o primeiro abaixo da venda, cada um abaixo do anterior", () => {
    expect(pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 13_000, coupon_code: "A1" }] }).success).toBe(false);
    expect(
      pricingSchema.safeParse({
        ...BASE,
        steps: [
          { price_cents: 11_000, coupon_code: "A1" },
          { price_cents: 12_000, coupon_code: "A2" },
        ],
      }).success,
    ).toBe(false);
  });

  it("no máximo 6 degraus", () => {
    const degraus = (valores: number[]) => valores.map((p, i) => ({ price_cents: p, coupon_code: `C${i}x` }));
    const seis = degraus([10_000, 9_000, 8_000, 7_000, 6_000, 5_000]);
    expect(pricingSchema.safeParse({ ...BASE, steps: seis }).success).toBe(true);
    expect(pricingSchema.safeParse({ ...BASE, steps: [...seis, ...degraus([4_000])] }).success).toBe(false);
  });
});

describe("piso e leitura", () => {
  it("o piso é o último degrau; sem degrau, é o próprio valor de venda", () => {
    expect(pisoEmCentavos(pricingSchema.parse(COM_DEGRAUS))).toBe(10_000);
    expect(pisoEmCentavos(pricingSchema.parse(BASE))).toBe(13_000);
  });

  it("lerPricing devolve null para desligado, ausente ou shape estranho (a agente não negocia)", () => {
    expect(lerPricing({ pricing: { ...BASE, enabled: false } })).toBeNull();
    expect(lerPricing({})).toBeNull();
    expect(lerPricing(null)).toBeNull();
    expect(lerPricing({ pricing: "lixo" })).toBeNull();
    expect(lerPricing({ pricing: { enabled: true, list_price_cents: 5 } })).toBeNull();
    expect(lerPricing({ pricing: COM_DEGRAUS })).not.toBeNull();
  });

  it("reais escreve redondo sem centavos e quebrado com vírgula", () => {
    expect(reais(13_000)).toBe("R$ 130");
    expect(reais(12_990)).toBe("R$ 129,90");
    expect(reais(10_005)).toBe("R$ 100,05");
  });
});

describe("blocoDePreco", () => {
  const cfg = pricingSchema.parse(COM_DEGRAUS);

  it("desligado ou ausente: nada é acrescentado ao prompt", () => {
    expect(blocoDePreco(null)).toBe("");
    expect(blocoDePreco(undefined)).toBe("");
    expect(blocoDePreco({ ...pricingSchema.parse(BASE), enabled: false })).toBe("");
  });

  it("sempre traz o valor de venda, o molde do preço com a referência, o molde de antes da leitura e a proibição abaixo do mínimo", () => {
    const b = blocoDePreco(cfg, { reclamacoes: 0 });
    expect(b).toContain("Valor de venda: R$ 130");
    expect(b).toContain("O valor de referência do trabalho é R$ 260; pra você fica R$ 130, pagamento único e seguro.");
    expect(b).toContain("A leitura é por minha conta");
    expect(b).toContain("NUNCA cite valor abaixo de R$ 100");
    expect(b).toContain("NUNCA repita o valor que ela propuser");
    // Sem urgência inventada.
    expect(b).toContain("sem prazo");
  });

  it("a escada é UM molde por turno, escolhido pela contagem — e os degraus seguintes não aparecem", () => {
    // Preço ainda não dito e ela ainda não reclamou: nada de desconto, nenhum valor menor no texto.
    for (const r of [null, 0]) {
      const b = blocoDePreco(cfg, { reclamacoes: r });
      expect(b).toMatch(/NÃO (ofereça|fale)/);
      expect(b).not.toContain("ESMERALDA");
      expect(b).not.toContain("R$ 110");
    }
    // 1ª reclamação: JÁ o degrau 1 (medido em 08/10/2026: segurar o valor na 1ª perdia quem não
    // tinha o valor cheio), e pergunta UMA vez quanto ela consegue.
    const b1 = blocoDePreco(cfg, { reclamacoes: 1 });
    expect(b1).toContain("ofereça AGORA R$ 110");
    expect(b1).toContain("NÃO repita o valor de venda");
    expect(b1).toContain("use o cupom CUPOM110 no pagamento, no mesmo link");
    expect(b1).toContain("me diz quanto você consegue fazer hoje");
    expect(b1).not.toContain("pay.cakto.com.br/abc_100");
    expect(b1).not.toContain("MENOR valor possível");
    // 2ª: o último degrau, que é o mínimo, com o link dele — e sem perguntar de novo.
    const b2 = blocoDePreco(cfg, { reclamacoes: 2 });
    expect(b2).toContain("ofereça AGORA R$ 100, que é o MENOR valor possível");
    expect(b2).toContain("pague por este link: https://pay.cakto.com.br/abc_100");
    expect(b2).not.toContain("CUPOM110");
    expect(b2).not.toContain("quanto você consegue");
    // 3ª em diante: já recebeu o menor valor; não oferece mais nada e combina a data POR ESSE valor.
    const b3 = blocoDePreco(cfg, { reclamacoes: 3 });
    expect(b3).toContain("já recebeu o menor valor possível (R$ 100)");
    expect(b3).toContain("deixo combinado por esse valor");
    expect(b3).not.toContain("CUPOM110");
  });

  it("⭐ ela disse quanto tem: pula direto para o degrau que cabe, sem repetir o número dela", () => {
    // Tem R$ 115: cabe o degrau de R$ 110 (o maior que não passa do que ela tem).
    const cabe = blocoDePreco(cfg, { reclamacoes: 1, valorQueTemCents: 11_500 });
    expect(cabe).toContain("ela disse quanto consegue pagar");
    expect(cabe).toContain("ofereça AGORA R$ 110");
    expect(cabe).not.toContain("R$ 115");
    expect(cabe).not.toContain("quanto você consegue");
    // Tem R$ 40, menos que o mínimo: o mínimo, dito como mínimo — nunca os R$ 40.
    const abaixo = blocoDePreco(cfg, { reclamacoes: 1, valorQueTemCents: 4_000 });
    expect(abaixo).toContain("ofereça AGORA R$ 100, que é o MENOR valor possível");
    expect(abaixo).not.toContain("R$ 40");
  });

  it("⭐ outra data só depois do valor do degrau, e a data vale para ESSE valor; falta do essencial encerra a insistência", () => {
    const b = blocoDePreco(cfg, { reclamacoes: 1 });
    expect(b).toContain("OUTRA DATA: só combine pagamento em outra data DEPOIS de dizer R$ 110");
    expect(b).toContain("nunca para o valor de venda");
    expect(b).toContain("falta para o essencial");
    // Antes de qualquer reclamação nada disso aparece (não insinua que existe valor menor).
    expect(blocoDePreco(cfg, { reclamacoes: 0 })).not.toContain("OUTRA DATA");
  });

  it("⭐ com degraus, a negociação é da agente em TODO passo: não chama humano por valor nem para mandar link", () => {
    for (const r of [null, 0, 1, 2, 3, 4]) {
      expect(blocoDePreco(cfg, { reclamacoes: r })).toContain("NÃO chame atendimento humano por causa de valor");
    }
    // Sem degraus não há o que negociar, e a regra não aparece.
    expect(blocoDePreco(pricingSchema.parse(BASE), { reclamacoes: 2 })).not.toContain("NÃO chame atendimento humano");
  });

  it("sem degraus: o valor é único e a agente não inventa cupom, qualquer que seja a contagem", () => {
    const b = blocoDePreco(pricingSchema.parse(BASE), { reclamacoes: 3 });
    expect(b).toContain("não tem desconto");
    expect(b).toContain("NUNCA cite valor abaixo de R$ 130");
    expect(b).not.toContain("Valor de referência");
    expect(b).toContain("O trabalho custa R$ 130, pagamento único e seguro.");
  });
});

describe("reclamacoesDeValor", () => {
  const nossa = (body: string) => ({ direction: "outbound", body });
  const dela = (body: string) => ({ direction: "inbound", body });

  it("preço ainda não dito: null — quem pergunta 'tem desconto?' antes da leitura não entrou na escada", () => {
    expect(reclamacoesDeValor([dela("oi"), nossa("Boa noite."), dela("tem desconto?")])).toBeNull();
  });

  it("depois do preço dito: conta só as mensagens DELA que reclamam do valor", () => {
    const base = [nossa("O trabalho custa R$ 130, pagamento único."), dela("ok, entendi")];
    expect(reclamacoesDeValor(base)).toBe(0);
    expect(reclamacoesDeValor([...base, dela("nossa, tá caro")])).toBe(1);
    expect(reclamacoesDeValor([...base, dela("tá caro"), nossa("Entendo."), dela("faz por menos?")])).toBe(2);
    expect(reclamacoesDeValor([...base, dela("tem desconto"), dela("não tenho como pagar isso")])).toBe(2);
  });

  it("a agente falando de desconto não conta como reclamação da pessoa", () => {
    expect(reclamacoesDeValor([nossa("R$ 130 no link."), nossa("Consigo um desconto pra você.")])).toBe(0);
  });

  it.each([
    "muito caro pra mim",
    "tem como dar um desconto",
    "não tenho dinheiro agora",
    "sem condição no momento",
    "faz por 100",
    "tem algo mais barato?",
    "o valor tá alto",
    "fora do meu orçamento",
    // Medidas em produção: a pessoa disse isto e a escada não andou.
    "Porque eu não tenho o dinheiro",
    "não tenho esse valor",
    "eu não tenho tudo isso",
    "não tenho os 130",
    "não tenho R$ 130 à vista",
    "não tenho agora",
    "tô desempregada",
    "só recebo dia 10",
    "só consigo pagar depois do dia 20",
    "quando eu receber eu faço",
  ])("reconhece a reclamação: %s", (frase) => {
    expect(reclamacoesDeValor([nossa("Custa R$ 130."), dela(frase)])).toBe(1);
  });

  it.each(["adorei a leitura", "meu caro amigo me indicou", "posso pagar amanhã?", "manda o link", "não tenho dúvida", "não tenho cartão", "não uso pix", "já recebo o passo a passo?"])(
    "não confunde com reclamação: %s",
    (frase) => {
      expect(reclamacoesDeValor([nossa("Custa R$ 130."), dela(frase)])).toBe(0);
    },
  );

  it("o painel de Teste: um histórico colado com 'Lead:' e 'Esmeralda:' vira a conversa", () => {
    const colado = [
      "[Histórico da conversa até aqui]",
      "Lead: faz sim, quanto é",
      "Esmeralda: O trabalho custa R$ 130, pagamento único e seguro.",
      "Lead: tá caro, não consigo pagar isso",
      "Esmeralda: Entendo. O valor é R$ 130, pagamento único.",
      "",
      "[Nova mensagem do lead — responda só a ela]",
      "ainda tá caro, faz por menos?",
    ].join("\n");
    expect(reclamacoesDeValor([{ direction: "inbound", body: colado }])).toBe(2);
  });

  it("mensagem comum (sem esse formato de linha) passa como veio", () => {
    expect(expandirHistoricoColado([{ direction: "inbound", body: "Lead: só um texto" }]).length).toBe(1);
    expect(expandirHistoricoColado([{ direction: "inbound", body: "oi, tudo bem?" }])).toEqual([
      { direction: "inbound", body: "oi, tudo bem?" },
    ]);
  });
});

describe("o que a pessoa disse que tem — e o aviso de antes do preço", () => {
  const dela = (body: string) => ({ direction: "inbound", body });
  const nossa = (body: string) => ({ direction: "outbound", body });
  const preco = nossa("O trabalho custa R$ 130, pagamento único.");

  it.each([
    ["só tenho 60", 6_000],
    ["eu tenho só 70 reais", 7_000],
    ["consigo pagar 80 hoje", 8_000],
    ["faz por 50?", 5_000],
    ["dá pra fazer por R$ 90", 9_000],
    ["tenho 55,00 no pix", 5_500],
    ["no momento só 60 reais", 6_000],
  ])("%s", (frase, cents) => {
    expect(valorQueAPessoaTem([preco, dela(frase)])).toBe(cents);
  });

  it.each([
    "não tenho 100",
    "nem 50 reais eu tenho",
    "tenho 35 anos",
    "só recebo dia 10",
    "parcela em 12x?",
    "tenho 2 filhos",
    "estou sem dinheiro",
  ])("não é valor que ela tem: %s", (frase) => {
    expect(valorQueAPessoaTem([preco, dela(frase)])).toBeNull();
  });

  it("vale a ÚLTIMA vez que ela disse, e só depois do preço", () => {
    expect(valorQueAPessoaTem([preco, dela("só tenho 50"), nossa("Entendo."), dela("consigo 70")])).toBe(7_000);
    expect(valorQueAPessoaTem([dela("só tenho 50"), preco])).toBeNull();
    expect(valorQueAPessoaTem([dela("só tenho 50")])).toBeNull();
  });

  it("dizer quanto tem já conta como reclamação; valor igual ou acima do de venda não é negociação", () => {
    const c = { list_price_cents: 13_000 };
    expect(estadoDaNegociacao(c, [preco, dela("consigo 80")])).toEqual({ reclamacoes: 1, valorQueTemCents: 8_000 });
    expect(estadoDaNegociacao(c, [preco, dela("tenho 130 aqui")])).toEqual({ reclamacoes: 0, valorQueTemCents: null });
    expect(estadoDaNegociacao(c, [dela("consigo 80")])).toEqual({ reclamacoes: null, valorQueTemCents: null });
  });

  it("⭐ quem avisou ANTES do preço que estava sem dinheiro chega um degrau à frente — mas só depois de reagir ao preço", () => {
    const antes = [dela("já aviso que estou sem dinheiro"), preco];
    expect(reclamacoesDeValor(antes)).toBe(0);
    expect(reclamacoesDeValor([...antes, dela("ok, me manda o link")])).toBe(0);
    expect(reclamacoesDeValor([...antes, dela("não tenho esse valor")])).toBe(2);
    expect(reclamacoesDeValor([preco, dela("não tenho esse valor")])).toBe(1);
  });

  it.each(["só tenho isso", "tenho só um pouco", "tô bem apertada esse mês", "não vou poder pagar", "vai ficar pra depois"])(
    "frase de quem tem menos conta como reclamação: %s",
    (frase) => {
      expect(reclamacoesDeValor([preco, dela(frase)])).toBe(1);
    },
  );
});

describe("ela deu a data para pagar: o turno fecha o combinado com o valor já oferecido", () => {
  const dela = (body: string) => ({ direction: "inbound", body });
  const nossa = (body: string) => ({ direction: "outbound", body });
  const oferta = [nossa("O trabalho custa R$ 130."), dela("não tenho esse valor"), nossa("Consigo fazer por R$ 110 pra você. Cabe hoje?")];
  const cfg = pricingSchema.parse(COM_DEGRAUS);

  it.each([
    "Eu não tenho nada agora só dia 27 ou 28 deste mês",
    "só recebo no final do mês",
    "dia 10",
    "consigo pagar na sexta",
    "quando eu receber eu faço",
    "semana que vem cai meu salário",
    "pode ser 05/11?",
  ])("é data para pagar: %s", (frase) => {
    expect(deuDataParaPagar([...oferta, dela(frase)])).toBe(true);
  });

  it.each(["domingo fui na igreja", "amanhã te conto o resto", "ok, obrigada", "ele sumiu faz 10 dias"])(
    "não é data para pagar: %s",
    (frase) => {
      expect(deuDataParaPagar([...oferta, dela(frase)])).toBe(false);
    },
  );

  it("só vale para as mensagens que este turno responde, e só com o preço já dito", () => {
    expect(deuDataParaPagar([...oferta, dela("só dia 27"), nossa("Combinado."), dela("obrigada")])).toBe(false);
    expect(deuDataParaPagar([...oferta, dela("só dia 27"), dela("pode ser?")])).toBe(true);
    expect(deuDataParaPagar([dela("só recebo dia 10")])).toBe(false);
  });

  it("⭐ o molde fecha data + valor JÁ oferecido + retorno agendado, e proíbe a despedida sem compromisso", () => {
    const b = blocoDePreco(cfg, { reclamacoes: 2, dataParaOValorCents: 11_000 });
    expect(b).toContain("schedule_followup");
    expect(b).toContain("o seu valor fica em R$ 110");
    expect(b).toContain('NÃO diga "me chama quando receber"');
    // Quem adia não ganha mais um degrau: a 2ª reclamação liberaria R$ 100, e o link dele não aparece.
    expect(b).not.toContain("pay.cakto.com.br/abc_100");
    expect(b).not.toContain("ofereça AGORA");
  });

  it("sem degrau já oferecido, com valor que não é da escada, ou com ela dizendo quanto tem: segue a negociação comum", () => {
    expect(blocoDePreco(cfg, { reclamacoes: 1, dataParaOValorCents: null })).toContain("ofereça AGORA R$ 110");
    expect(blocoDePreco(cfg, { reclamacoes: 1, dataParaOValorCents: 6_700 })).toContain("ofereça AGORA R$ 110");
    expect(blocoDePreco(cfg, { reclamacoes: 2, dataParaOValorCents: 11_000, valorQueTemCents: 10_000 })).toContain("ofereça AGORA R$ 100");
  });

  it("a fiação: o turno só fecha a data com o último degrau que a agente DISSE", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    expect(turno).toContain("deuDataParaPagar(openingContext.context.messages)");
    expect(turno).toContain("? valorCombinadoNaConversa(agentConfig.pricing, openingContext.context.messages)");
  });
});

describe("retorno de pagamento só é agendado depois de o degrau ser oferecido", () => {
  const dela = (body: string) => ({ direction: "inbound", body });
  const nossa = (body: string) => ({ direction: "outbound", body });
  const cfg = pricingSchema.parse(COM_DEGRAUS);
  const semOferta = [nossa("O trabalho custa R$ 130."), dela("só recebo dia 20")];
  const comOferta = [...semOferta, nossa("Consigo fazer por R$ 110 pra você."), dela("só dia 20 mesmo")];
  const estado = { reclamacoes: 1, valorQueTemCents: null, combinadoCents: null };
  const promessa = "Voltar no dia 20 para enviar o link de R$ 130 do trabalho";

  it("⭐ ela reclamou do valor e a agente ainda não ofereceu o degrau: falta oferecer R$ 110", () => {
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, estado, semOferta, promessa)).toBe(11_000);
  });

  it("degrau já oferecido, combinado anterior, ou sem reclamação: o agendamento segue", () => {
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, { ...estado, reclamacoes: 2 }, comOferta, promessa)).toBeNull();
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, { ...estado, combinadoCents: 10_000 }, semOferta, promessa)).toBeNull();
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, { ...estado, reclamacoes: 0 }, semOferta, promessa)).toBeNull();
    expect(degrauQueFaltaOferecerAntesDeAgendar(pricingSchema.parse(BASE), estado, semOferta, promessa)).toBeNull();
  });

  it("retorno que não é de pagamento não é barrado", () => {
    expect(
      degrauQueFaltaOferecerAntesDeAgendar(cfg, estado, semOferta, "Voltar amanhã cedo para saber como ela passou a noite"),
    ).toBeNull();
  });

  it("a fiação: a ferramenta de agendar consulta a regra antes de criar o retorno", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    const guarda = turno.indexOf("degrauQueFaltaOferecerAntesDeAgendar(\n");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(turno.indexOf("const res = await applyScheduleFollowup("));
  });
});

describe("adiar o pagamento é reclamação de valor; faltar para o essencial encerra a cobrança", () => {
  const dela = (body: string) => ({ direction: "inbound", body });
  const nossa = (body: string) => ({ direction: "outbound", body });
  const preco = nossa("O seu rito completo fica em R$ 130, pagamento único.");
  const cfg = pricingSchema.parse(COM_DEGRAUS);

  it.each(["Vou ter o dinheiro só semana que vem 😞", "só consigo pagar na sexta", "dia 20 cai meu salário", "quando eu tiver a grana, mês que vem"])(
    "⭐ conta como reclamação (a frase real de 08/10 não contava): %s",
    (frase) => {
      expect(reclamacoesDeValor([preco, dela(frase)])).toBe(1);
    },
  );

  it.each(["Não consigo", "não dá 😞", "Infelizmente não tenho", "Então tem como a gente conversa e fazer na segunda feira"])(
    "⭐ resposta curta de quem não pode, e adiar o trabalho, contam (frases reais de 08/10): %s",
    (frase) => {
      expect(reclamacoesDeValor([preco, dela(frase)])).toBe(1);
    },
  );

  it("negativa dentro de frase longa não conta sozinha", () => {
    expect(reclamacoesDeValor([preco, dela("não consigo parar de pensar nele desde que ele foi embora de casa")])).toBe(0);
  });

  it("retorno escrito como 'seguir com o combinado do rito' também é de pagamento", () => {
    const estado = { reclamacoes: 1, valorQueTemCents: null, combinadoCents: null };
    const msgs = [preco, dela("Não consigo")];
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, estado, msgs, "Voltar na segunda para seguir com o combinado do rito")).toBe(11_000);
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, estado, msgs, "Retomar caso o dinheiro já tenha entrado")).toBe(11_000);
    expect(degrauQueFaltaOferecerAntesDeAgendar(cfg, estado, msgs, "Voltar para saber como ela está e se a situação de trabalho avançou")).toBeNull();
  });

  it.each(["Quarta feira", "dia 12 faz um ano que ele saiu de casa", "amanhã te conto"])("data sem fala de pagar não conta: %s", (frase) => {
    expect(reclamacoesDeValor([preco, dela(frase)])).toBe(0);
  });

  it.each([
    "Muito pouco e deixar de comprar remédio pressão.",
    "não tenho nem pros remédios",
    "tá faltando comida em casa",
    "vou ter que tirar do aluguel",
    "sem dinheiro pra comida",
  ])("falta para o essencial: %s", (frase) => {
    expect(faltaParaOEssencial([dela(frase), preco])).toBe(true);
  });

  it.each(["não tenho dinheiro agora", "ele toma remédio controlado", "pago aluguel todo mês em dia", "só recebo dia 10"])(
    "não é falta do essencial: %s",
    (frase) => {
      expect(faltaParaOEssencial([preco, dela(frase)])).toBe(false);
    },
  );

  it("⭐ com falta do essencial o bloco não traz degrau, link nem molde de cobrança — qualquer que seja a contagem", () => {
    for (const reclamacoes of [0, 1, 2, 3]) {
      const b = blocoDePreco(cfg, { reclamacoes, faltaParaOEssencial: true, dataParaOValorCents: 11_000 });
      expect(b).toContain("ELA DISSE QUE FALTA PARA O ESSENCIAL");
      expect(b).not.toContain("ofereça AGORA");
      expect(b).not.toContain("CUPOM110");
      expect(b).not.toContain("schedule_followup");
    }
    expect(blocoDePreco(pricingSchema.parse(BASE), { reclamacoes: 1, faltaParaOEssencial: true })).toContain("FALTA PARA O ESSENCIAL");
    expect(blocoDePreco(cfg, { reclamacoes: 1 })).not.toContain("ELA DISSE QUE FALTA PARA O ESSENCIAL");
  });

  it("a fiação: o turno lê a conversa e a ferramenta de agendar recusa pagamento de quem falta o essencial", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    expect(turno).toContain("faltaParaOEssencial(openingContext.context.messages)");
    expect(turno).toContain("faltaParaOEssencial: faltaParaOEssencialNoTurno");
    expect(turno).toContain("NÃO agende pagamento: ela disse que falta para o essencial");
  });
});

describe("a trava de promessas", () => {
  const pricing = pricingSchema.parse(COM_DEGRAUS);

  it("o piso vira minPriceCents e o teto de desconto arredonda PARA BAIXO", () => {
    // 130 → 100 = 23,07…% → 23
    expect(tabelaDoPiso(pricing)).toEqual({ minPriceCents: 10_000, maxDiscountPercent: 23 });
    // sem degraus: nenhum desconto permitido
    expect(tabelaDoPiso(pricingSchema.parse(BASE))).toEqual({ minPriceCents: 13_000, maxDiscountPercent: 0 });
  });

  it("preserva o que a tabela já tinha e não é do preço", () => {
    expect(tabelaDoPiso(pricing, { maxInstallments: 3 })).toMatchObject({ maxInstallments: 3, minPriceCents: 10_000 });
  });

  it("veta valor abaixo do mínimo e libera o do degrau — a função real de decisão", () => {
    const table = tabelaDoPiso(pricing);
    expect(decidePromise({ candidate: "Consigo por R$ 90 pra você.", table }).allow).toBe(false);
    expect(decidePromise({ candidate: "Consigo por R$ 100, é o menor valor.", table }).allow).toBe(true);
    expect(decidePromise({ candidate: "O valor de referência é R$ 260; pra você fica R$ 130.", table }).allow).toBe(true);
    expect(decidePromise({ candidate: "Te dou 40% de desconto.", table }).allow).toBe(false);
  });
});

describe("sincronizarPiso", () => {
  /** Banco de mentira que grava o que a função manda e devolve o que ela pergunta. */
  function bancoFalso(tabelaAtual: Record<string, unknown> | null) {
    const escritas: Array<{ tabela: string; op: string; dados: unknown }> = [];
    const admin = {
      from(tabela: string) {
        const q: Record<string, unknown> = {};
        const cadeia = () => q;
        q.select = cadeia;
        q.eq = cadeia;
        q.maybeSingle = async () => {
          if (tabela === "promise_table_pointers") return { data: tabelaAtual ? { version_id: "v-atual" } : null };
          if (tabela === "promise_table_versions") return { data: tabelaAtual ? { values: tabelaAtual } : null };
          return { data: null };
        };
        q.insert = (dados: unknown) => {
          escritas.push({ tabela, op: "insert", dados });
          return { select: () => ({ single: async () => ({ data: { id: "v-novo" }, error: null }) }) };
        };
        q.upsert = async (dados: unknown) => {
          escritas.push({ tabela, op: "upsert", dados });
          return { error: null };
        };
        return q;
      },
    };
    return { admin: admin as never, escritas };
  }

  it("insere a versão nova com o piso e move o ponteiro da organização para ela", async () => {
    const { admin, escritas } = bancoFalso({ maxInstallments: 2 });
    const r = await sincronizarPiso(admin, "org-1", pricingSchema.parse(COM_DEGRAUS));
    expect(r.versionId).toBe("v-novo");
    expect(escritas[0]).toMatchObject({
      tabela: "promise_table_versions",
      op: "insert",
      dados: { organization_id: "org-1", values: { maxInstallments: 2, minPriceCents: 10_000, maxDiscountPercent: 23 } },
    });
    expect(escritas[1]).toMatchObject({
      tabela: "promise_table_pointers",
      op: "upsert",
      dados: { organization_id: "org-1", version_id: "v-novo" },
    });
  });

  it("sem tabela anterior, cria só com o preço", async () => {
    const { admin, escritas } = bancoFalso(null);
    await sincronizarPiso(admin, "org-1", pricingSchema.parse(BASE));
    expect(escritas[0]?.dados).toMatchObject({ values: { minPriceCents: 13_000, maxDiscountPercent: 0 } });
  });
});

describe("a escada vira piso da trava, turno a turno", () => {
  const cfg = pricingSchema.parse(COM_DEGRAUS);

  it("o menor valor permitido agora sobe e desce com a contagem", () => {
    expect(precoPermitidoAgora(cfg, null)).toBe(13_000);
    expect(precoPermitidoAgora(cfg, 0)).toBe(13_000);
    expect(precoPermitidoAgora(cfg, 1)).toBe(11_000); // a 1ª reclamação já libera o degrau 1
    expect(precoPermitidoAgora(cfg, 2)).toBe(10_000);
    expect(precoPermitidoAgora(cfg, 9)).toBe(10_000); // nunca abaixo do mínimo
    // Dizer quanto tem pula a escada — e nunca abaixo do mínimo, nem acima do que a contagem já deu.
    expect(precoPermitidoAgora(cfg, 1, 10_500)).toBe(10_000);
    expect(precoPermitidoAgora(cfg, 1, 11_900)).toBe(11_000);
    expect(precoPermitidoAgora(cfg, 1, 2_000)).toBe(10_000);
    expect(precoPermitidoAgora(cfg, 2, 11_900)).toBe(10_000);
    expect(precoPermitidoAgora(cfg, 0, 5_000)).toBe(13_000); // sem reclamação não há degrau
    expect(precoPermitidoAgora(pricingSchema.parse(BASE), 5)).toBe(13_000); // sem degraus: sem desconto
  });

  it("a tabela do turno só SOBE o piso da organização — nunca o desce", () => {
    expect(tabelaDoTurno(null, undefined)).toBeNull();
    expect(tabelaDoTurno({ minPriceCents: 10_000 }, undefined)).toEqual({ minPriceCents: 10_000 });
    expect(tabelaDoTurno({ minPriceCents: 10_000, maxInstallments: 3 }, 13_000)).toEqual({
      minPriceCents: 13_000,
      maxInstallments: 3,
    });
    expect(tabelaDoTurno({ minPriceCents: 10_000 }, 5_000)).toEqual({ minPriceCents: 10_000 });
    expect(tabelaDoTurno(null, 13_000)).toEqual({ minPriceCents: 13_000 });
  });

  it("desconto oferecido CEDO demais é vetado; o do degrau liberado passa (a rede de verdade)", () => {
    // Sem reclamação: o modelo ignora o molde e oferece R$ 110 → vetado.
    const cedo = tabelaDoTurno({ minPriceCents: 10_000 }, precoPermitidoAgora(cfg, 0));
    expect(decidePromise({ candidate: "Fica R$ 110 com o cupom CUPOM110.", table: cedo! }).allow).toBe(false);
    expect(decidePromise({ candidate: "Entendo. O valor é R$ 130, pagamento único.", table: cedo! }).allow).toBe(true);
    // 1ª reclamação: R$ 110 já é permitido; R$ 100 ainda não.
    const primeira = tabelaDoTurno({ minPriceCents: 10_000 }, precoPermitidoAgora(cfg, 1));
    expect(decidePromise({ candidate: "Fica R$ 110 com o cupom CUPOM110.", table: primeira! }).allow).toBe(true);
    expect(decidePromise({ candidate: "Consigo R$ 100 pra você.", table: primeira! }).allow).toBe(false);
  });

  it("a fiação: o turno passa o piso do turno à cadeia de envio, e a cadeia o aplica à tabela", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    const cadeia = readFileSync("lib/agent-engine/guardrails/before-send.ts", "utf8");
    expect(turno).toContain("precoPermitidoAgora(agentConfig.pricing, reclamacoesDeValorNoTurno, valorQueTemNoTurno)");
    expect(turno).toContain("estadoDaNegociacao(agentConfig.pricing, openingContext.context.messages)");
    expect(turno).toContain("...(promiseMinPriceCents !== undefined ? { promiseMinPriceCents } : {})");
    expect(turno).toContain("system: systemDoTurno");
    expect(cadeia).toContain("tabelaDoTurno(promise?.table ?? null, args.promiseMinPriceCents)");
  });
});

describe("um link por produto no degrau (cada trabalho tem o seu link de oferta)", () => {
  const LINKS = [
    { name: "Abertura do Coração", url: "https://pay.cakto.com.br/5bvpedx" },
    { name: "Limpeza e Proteção", url: "https://pay.cakto.com.br/3vmnf6v" },
  ];
  const cfg = pricingSchema.parse({ ...BASE, steps: [{ price_cents: 5_070, product_links: LINKS }] });

  it("o degrau vale só com links por produto (sem cupom nem link único)", () => {
    expect(pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 5_070, product_links: LINKS }] }).success).toBe(true);
    expect(pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 5_070, product_links: [] }] }).success).toBe(false);
  });

  it("recusa link que não é https e nome vazio", () => {
    expect(
      pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 5_070, product_links: [{ name: "X", url: "http://a.com/x" }] }] }).success,
    ).toBe(false);
    expect(
      pricingSchema.safeParse({ ...BASE, steps: [{ price_cents: 5_070, product_links: [{ name: " ", url: "https://a.com/x" }] }] }).success,
    ).toBe(false);
  });

  it("o molde leva um marcador (não a lista) e a lista vem à parte, para a agente mandar só um", () => {
    const b = blocoDePreco(cfg, { reclamacoes: 1 });
    expect(b).toContain("R$ 50,70");
    expect(b).toContain("[o link do trabalho que você indicou");
    expect(b).toContain("LINKS NESTE VALOR (R$ 50,70)");
    expect(b).toContain("Abertura do Coração: https://pay.cakto.com.br/5bvpedx");
    expect(b).toContain("Limpeza e Proteção: https://pay.cakto.com.br/3vmnf6v");
    // o molde entre aspas NÃO carrega URL nenhuma
    const molde = b.match(/ESTE molde e nenhum outro[^"]*"([^"]+)"/)?.[1] ?? "";
    expect(molde).not.toContain("https://");
  });

  it("antes do degrau, nenhum link do valor menor aparece (não vaza)", () => {
    for (const reclamacoes of [null, 0]) {
      const b = blocoDePreco(cfg, { reclamacoes });
      expect(b).not.toContain("5bvpedx");
      expect(b).not.toContain("LINKS NESTE VALOR");
    }
  });

  it("o piso continua sendo o valor do degrau", () => {
    expect(pisoEmCentavos(cfg)).toBe(5_070);
  });
});

describe("a skill de objeção de preço não briga com o bloco de preço", () => {
  const skills = [{ name: "agendamento" }, { name: "objecao-preco" }];

  it("com a negociação ligada, a skill de objeção sai do turno (as outras ficam)", () => {
    const cfg = pricingSchema.parse({ ...BASE, steps: [{ price_cents: 5_070, coupon_code: "X1" }] });
    expect(semObjecaoDePrecoQuandoHaBloco(skills, cfg).map((s) => s.name)).toEqual(["agendamento"]);
  });

  it("sem preço configurado ou desligado, nada muda", () => {
    expect(semObjecaoDePrecoQuandoHaBloco(skills, undefined)).toHaveLength(2);
    expect(semObjecaoDePrecoQuandoHaBloco(skills, null)).toHaveLength(2);
    expect(semObjecaoDePrecoQuandoHaBloco(skills, pricingSchema.parse({ ...BASE, enabled: false }))).toHaveLength(2);
  });

  it("a fiação: o turno filtra as skills antes de montar o índice e o matcher", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    expect(turno).toContain("semObjecaoDePrecoQuandoHaBloco(await loadSkills(pool, tenantId), agentConfig?.pricing)");
  });
});
