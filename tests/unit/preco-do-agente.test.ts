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
import { blocoDePreco } from "@/lib/preco/bloco-do-prompt";
import { expandirHistoricoColado, precoPermitidoAgora, reclamacoesDeValor, tabelaDoTurno } from "@/lib/preco/estado-da-negociacao";
import { sincronizarPiso, tabelaDoPiso } from "@/lib/preco/sincronizar-piso";
import { lerPricing, pisoEmCentavos, pricingSchema, reais } from "@/lib/preco/tipos";

const BASE = { enabled: true, list_price_cents: 13_000 };
const COM_DEGRAUS = {
  ...BASE,
  anchor_price_cents: 26_000,
  anchor_is_real: true,
  steps: [
    { price_cents: 11_000, coupon_code: "ESMERALDA110" },
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

  it("no máximo 3 degraus", () => {
    const steps = [11_000, 10_000, 9_000, 8_000].map((p, i) => ({ price_cents: p, coupon_code: `C${i}x` }));
    expect(pricingSchema.safeParse({ ...BASE, steps }).success).toBe(false);
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
    // 1ª reclamação: mantém o valor, não fala de valor menor.
    const b1 = blocoDePreco(cfg, { reclamacoes: 1 });
    expect(b1).toContain("NÃO baixe");
    expect(b1).not.toContain("ESMERALDA");
    expect(b1).not.toContain("R$ 110");
    // 2ª: SÓ o degrau 1.
    const b2 = blocoDePreco(cfg, { reclamacoes: 2 });
    expect(b2).toContain("Ofereça SÓ R$ 110");
    expect(b2).toContain("use o cupom ESMERALDA110 no pagamento, no mesmo link");
    expect(b2).not.toContain("pay.cakto.com.br/abc_100");
    expect(b2).not.toContain("MENOR valor possível");
    // 3ª: o último degrau, que é o mínimo, com o link dele.
    const b3 = blocoDePreco(cfg, { reclamacoes: 3 });
    expect(b3).toContain("Ofereça SÓ R$ 100, que é o MENOR valor possível");
    expect(b3).toContain("pague por este link: https://pay.cakto.com.br/abc_100");
    expect(b3).not.toContain("ESMERALDA110");
    // 4ª em diante: já recebeu o menor valor; não oferece mais nada.
    const b4 = blocoDePreco(cfg, { reclamacoes: 4 });
    expect(b4).toContain("já recebeu o menor valor possível (R$ 100)");
    expect(b4).toContain("quer que eu te lembre amanhã");
    expect(b4).not.toContain("ESMERALDA110");
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
  ])("reconhece a reclamação: %s", (frase) => {
    expect(reclamacoesDeValor([nossa("Custa R$ 130."), dela(frase)])).toBe(1);
  });

  it.each(["adorei a leitura", "meu caro amigo me indicou", "posso pagar amanhã?", "manda o link"])(
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
    expect(precoPermitidoAgora(cfg, 1)).toBe(13_000); // a 1ª reclamação NÃO libera desconto
    expect(precoPermitidoAgora(cfg, 2)).toBe(11_000);
    expect(precoPermitidoAgora(cfg, 3)).toBe(10_000);
    expect(precoPermitidoAgora(cfg, 9)).toBe(10_000); // nunca abaixo do mínimo
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
    // 1ª reclamação: o modelo ignora o molde e oferece R$ 110 → vetado.
    const cedo = tabelaDoTurno({ minPriceCents: 10_000 }, precoPermitidoAgora(cfg, 1));
    expect(decidePromise({ candidate: "Fica R$ 110 com o cupom ESMERALDA110.", table: cedo! }).allow).toBe(false);
    expect(decidePromise({ candidate: "Entendo. O valor é R$ 130, pagamento único.", table: cedo! }).allow).toBe(true);
    // 2ª reclamação: R$ 110 já é permitido; R$ 100 ainda não.
    const segunda = tabelaDoTurno({ minPriceCents: 10_000 }, precoPermitidoAgora(cfg, 2));
    expect(decidePromise({ candidate: "Fica R$ 110 com o cupom ESMERALDA110.", table: segunda! }).allow).toBe(true);
    expect(decidePromise({ candidate: "Consigo R$ 100 pra você.", table: segunda! }).allow).toBe(false);
  });

  it("a fiação: o turno passa o piso do turno à cadeia de envio, e a cadeia o aplica à tabela", () => {
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    const cadeia = readFileSync("lib/agent-engine/guardrails/before-send.ts", "utf8");
    expect(turno).toContain("precoPermitidoAgora(agentConfig.pricing, reclamacoesDeValorNoTurno)");
    expect(turno).toContain("...(promiseMinPriceCents !== undefined ? { promiseMinPriceCents } : {})");
    expect(turno).toContain("system: systemDoTurno");
    expect(cadeia).toContain("tabelaDoTurno(promise?.table ?? null, args.promiseMinPriceCents)");
  });
});
