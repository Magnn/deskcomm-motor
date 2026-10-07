/**
 * A OFERTA DE PÓS-VENDA — o que a agente pode oferecer a quem já pagou, e quando.
 *
 * O defeito de origem: a tabela de preço só conhecia a primeira venda, e a trava de promessas
 * vetava qualquer valor menor que o de venda antes da 2ª reclamação. Um segundo produto mais
 * barato, escrito só no roteiro, era barrado em silêncio (produção, 06/10/2026: 32 vetos
 * `promise_out_of_table` em 24 h).
 *
 * O que estes testes seguram:
 *  - a oferta só libera para quem PAGOU, depois da espera, e nunca para quem devolveu;
 *  - o produto já comprado sai da lista;
 *  - sem a hora do pagamento, não libera (na dúvida, não oferece);
 *  - o bloco de quem comprou substitui a escada da primeira venda e não traz pressão;
 *  - o piso da trava da organização passa a enxergar a oferta mais barata.
 */
import { describe, expect, it } from "vitest";

import { blocoDePreco } from "@/lib/preco/bloco-do-prompt";
import { estadoDoPosVenda, horaDoPagamento, slugDoProduto } from "@/lib/preco/pos-venda";
import { pisoEmCentavos, pricingSchema } from "@/lib/preco/tipos";

const LINKS = [
  { name: "Abertura do Coração", url: "https://pay.exemplo.com/coracao70" },
  { name: "Abertura da Prosperidade", url: "https://pay.exemplo.com/prosperidade70" },
  { name: "Limpeza e Proteção", url: "https://pay.exemplo.com/limpeza70" },
];

const CONFIG = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13_000,
  steps: [{ price_cents: 10_000, payment_url: "https://pay.exemplo.com/negociado" }],
  post_sale: { enabled: true, price_cents: 7_000, wait_hours: 20, product_links: LINKS },
});

const PAGOU = new Date("2026-10-06T15:00:00Z");
const NO_DIA_SEGUINTE = new Date("2026-10-07T12:00:00Z"); // 21 h depois
const NO_MESMO_DIA = new Date("2026-10-06T20:00:00Z"); // 5 h depois

const TAGS_DE_QUEM_PAGOU = ["pago", "produto:abertura-do-coracao", "compra:abc"];

describe("slugDoProduto", () => {
  it("vira a mesma forma da marca que a compra grava no contato", () => {
    expect(slugDoProduto("Abertura do Coração")).toBe("abertura-do-coracao");
    expect(slugDoProduto("  Limpeza e Proteção! ")).toBe("limpeza-e-protecao");
  });
});

describe("horaDoPagamento", () => {
  it("lê `pago_em` do que a compra gravou, e devolve null para o que não é data", () => {
    expect(horaDoPagamento({ pago_em: "2026-10-06T15:00:00Z" })?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(horaDoPagamento({ pago_em: null })).toBeNull();
    expect(horaDoPagamento({ pago_em: "ontem" })).toBeNull();
    expect(horaDoPagamento(null)).toBeNull();
  });
});

describe("estadoDoPosVenda", () => {
  it("libera no dia seguinte para quem pagou, sem o produto que ela já comprou", () => {
    const estado = estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU }, [], NO_DIA_SEGUINTE);
    expect(estado?.priceCents).toBe(7_000);
    expect(estado?.links.map((l) => l.name)).toEqual(["Abertura da Prosperidade", "Limpeza e Proteção"]);
    expect(estado?.jaOferecida).toBe(false);
  });

  it("antes da espera não libera", () => {
    expect(estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU }, [], NO_MESMO_DIA)).toBeNull();
  });

  it("quem não pagou não recebe a segunda oferta", () => {
    expect(estadoDoPosVenda(CONFIG, { tags: ["lead"], pagoEm: PAGOU }, [], NO_DIA_SEGUINTE)).toBeNull();
  });

  it.each(["reembolso", "chargeback"])("quem teve %s não recebe a segunda oferta", (marca) => {
    const tags = [...TAGS_DE_QUEM_PAGOU, marca];
    expect(estadoDoPosVenda(CONFIG, { tags, pagoEm: PAGOU }, [], NO_DIA_SEGUINTE)).toBeNull();
  });

  it("sem a hora do pagamento não libera: na dúvida, não oferece", () => {
    expect(estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: null }, [], NO_DIA_SEGUINTE)).toBeNull();
  });

  it("oferta desligada, ou preço desligado, não libera", () => {
    const semOferta = pricingSchema.parse({ ...CONFIG, post_sale: { ...CONFIG.post_sale!, enabled: false } });
    const precoDesligado = pricingSchema.parse({ ...CONFIG, enabled: false });
    const compra = { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU };
    expect(estadoDoPosVenda(semOferta, compra, [], NO_DIA_SEGUINTE)).toBeNull();
    expect(estadoDoPosVenda(precoDesligado, compra, [], NO_DIA_SEGUINTE)).toBeNull();
    expect(estadoDoPosVenda(null, compra, [], NO_DIA_SEGUINTE)).toBeNull();
  });

  it("o nome do checkout casa com o nome da tela: 'Trabalho X: Abertura do Coração' tira 'Abertura do Coração'", () => {
    const tags = ["pago", "produto:trabalho-espiritual-abertura-do-coracao"];
    const estado = estadoDoPosVenda(CONFIG, { tags, pagoEm: PAGOU }, [], NO_DIA_SEGUINTE);
    expect(estado?.links.map((l) => l.name)).not.toContain("Abertura do Coração");
  });

  it("quem já comprou tudo o que a oferta tem não recebe oferta", () => {
    const tags = ["pago", "produto:abertura-do-coracao", "produto:abertura-da-prosperidade", "produto:limpeza-e-protecao"];
    expect(estadoDoPosVenda(CONFIG, { tags, pagoEm: PAGOU }, [], NO_DIA_SEGUINTE)).toBeNull();
  });

  it("produto que a compra não soube nomear ('outro') não tira link nenhum", () => {
    const estado = estadoDoPosVenda(CONFIG, { tags: ["pago", "produto:outro"], pagoEm: PAGOU }, [], NO_DIA_SEGUINTE);
    expect(estado?.links).toHaveLength(3);
  });

  it("marca `jaOferecida` quando a agente já mandou um dos links", () => {
    const mensagens = [
      { direction: "inbound", body: "bom dia, acendi a vela" },
      { direction: "outbound", body: "https://pay.exemplo.com/limpeza70" },
    ];
    const estado = estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU }, mensagens, NO_DIA_SEGUINTE);
    expect(estado?.jaOferecida).toBe(true);
  });

  it("link colado pela PESSOA não conta como oferta feita", () => {
    const mensagens = [{ direction: "inbound", body: "é esse? https://pay.exemplo.com/limpeza70" }];
    const estado = estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU }, mensagens, NO_DIA_SEGUINTE);
    expect(estado?.jaOferecida).toBe(false);
  });
});

describe("bloco de preço de quem já comprou", () => {
  const liberado = estadoDoPosVenda(CONFIG, { tags: TAGS_DE_QUEM_PAGOU, pagoEm: PAGOU }, [], NO_DIA_SEGUINTE);

  it("substitui a escada da primeira venda: nada de R$ 130 nem do degrau negociado", () => {
    const bloco = blocoDePreco(CONFIG, { reclamacoes: 3, posVenda: liberado });
    expect(bloco).toContain("JÁ COMPROU");
    expect(bloco).toContain("R$ 70");
    expect(bloco).not.toContain("R$ 130");
    expect(bloco).not.toContain("negociado");
    expect(bloco).not.toContain("NEGOCIAÇÃO:");
  });

  it("traz só os links que ainda fazem sentido", () => {
    const bloco = blocoDePreco(CONFIG, { reclamacoes: 0, posVenda: liberado });
    expect(bloco).toContain("https://pay.exemplo.com/prosperidade70");
    expect(bloco).not.toContain("https://pay.exemplo.com/coracao70");
  });

  it("proíbe prazo e ameaça, e manda oferecer uma vez só", () => {
    const bloco = blocoDePreco(CONFIG, { reclamacoes: 0, posVenda: liberado });
    expect(bloco).toMatch(/uma vez só/i);
    expect(bloco).toMatch(/Sem prazo/);
    expect(bloco).toMatch(/NUNCA diga que o trabalho que ela comprou não funciona/);
  });

  it("depois de oferecida, o bloco manda não repetir", () => {
    const bloco = blocoDePreco(CONFIG, { reclamacoes: 0, posVenda: { ...liberado!, jaOferecida: true } });
    expect(bloco).toMatch(/NÃO ofereça de novo/);
    expect(bloco).not.toMatch(/SEGUNDA OFERTA \(uma vez só\)/);
  });

  it("sem pós-venda liberado, o bloco é o da primeira venda, como sempre foi", () => {
    const comum = blocoDePreco(CONFIG, { reclamacoes: 0 });
    expect(blocoDePreco(CONFIG, { reclamacoes: 0, posVenda: null })).toBe(comum);
    expect(comum).toContain("R$ 130");
    expect(comum).not.toContain("JÁ COMPROU");
  });
});

describe("schema e piso", () => {
  it("a oferta exige ao menos um link: valor sem forma de pagar não existe", () => {
    const semLink = { ...CONFIG, post_sale: { enabled: true, price_cents: 7_000, wait_hours: 20, product_links: [] } };
    expect(pricingSchema.safeParse(semLink).success).toBe(false);
  });

  it("a espera padrão é a do 'dia seguinte'", () => {
    const lido = pricingSchema.parse({
      enabled: true,
      list_price_cents: 13_000,
      post_sale: { enabled: true, price_cents: 7_000, product_links: LINKS },
    });
    expect(lido.post_sale?.wait_hours).toBe(20);
  });

  it("config antiga, sem pós-venda, continua válida e com o mesmo piso", () => {
    const antiga = pricingSchema.parse({ enabled: true, list_price_cents: 13_000, steps: [{ price_cents: 10_000, coupon_code: "A1" }] });
    expect(antiga.post_sale).toBeUndefined();
    expect(pisoEmCentavos(antiga)).toBe(10_000);
  });

  it("o piso da trava enxerga a oferta de pós-venda quando ela é a mais barata", () => {
    expect(pisoEmCentavos(CONFIG)).toBe(7_000);
  });

  it("oferta desligada não baixa o piso", () => {
    const desligada = pricingSchema.parse({ ...CONFIG, post_sale: { ...CONFIG.post_sale!, enabled: false } });
    expect(pisoEmCentavos(desligada)).toBe(10_000);
  });
});
