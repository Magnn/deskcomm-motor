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
import { describe, expect, it } from "vitest";

import { decidePromise } from "@/lib/agent-engine/guardrails/promise/engine";
import { blocoDePreco } from "@/lib/preco/bloco-do-prompt";
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
  it("desligado ou ausente: nada é acrescentado ao prompt", () => {
    expect(blocoDePreco(null)).toBe("");
    expect(blocoDePreco(undefined)).toBe("");
    expect(blocoDePreco({ ...pricingSchema.parse(BASE), enabled: false })).toBe("");
  });

  it("com degraus: o valor de venda, a referência, os degraus na ordem, o cupom, o mínimo e a proibição de abaixo dele", () => {
    const b = blocoDePreco(pricingSchema.parse(COM_DEGRAUS));
    expect(b).toContain("Valor de venda: R$ 130");
    expect(b).toContain("Valor de referência: R$ 260");
    expect(b).toContain("valor de referência");
    // Molde do preço com a referência, em 2 bolhas (o link vai sozinho na segunda).
    expect(b).toContain("O valor de referência do trabalho é R$ 260; pra você fica R$ 130, pagamento único e seguro.");
    // Antes da leitura, nada de valor.
    expect(b).toContain("A leitura é por minha conta");
    // A escada de moldes: 1ª reclamação NÃO baixa; a 2ª oferece o degrau 1; a 3ª, o último (o mínimo).
    expect(b).toContain("1ª vez: NÃO baixe");
    expect(b.indexOf("2ª vez: ofereça só R$ 110")).toBeGreaterThan(b.indexOf("1ª vez"));
    expect(b.indexOf("3ª vez: ofereça só R$ 100")).toBeGreaterThan(b.indexOf("2ª vez"));
    expect(b).toContain("use o cupom ESMERALDA110 no pagamento, no mesmo link");
    expect(b).toContain("pague por este link: https://pay.cakto.com.br/abc_100");
    expect(b).toContain("MENOR valor possível");
    expect(b).toContain("Nunca ofereça um valor que não esteja nesta lista");
    expect(b).toContain("NUNCA cite valor abaixo de R$ 100");
    expect(b).toContain("NUNCA ofereça antes");
    // Sem urgência inventada.
    expect(b).toContain("sem prazo");
  });

  it("sem degraus: o valor é único e a agente não inventa cupom", () => {
    const b = blocoDePreco(pricingSchema.parse(BASE));
    expect(b).toContain("não tem desconto");
    expect(b).toContain("NUNCA cite valor abaixo de R$ 130");
    expect(b).not.toContain("Valor de referência");
    expect(b).toContain("O trabalho custa R$ 130, pagamento único e seguro.");
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
