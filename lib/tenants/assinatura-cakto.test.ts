/**
 * O aviso da Cakto vira "libera" ou "suspende" — e só quando é dela e é do
 * produto da assinatura. O exemplo é o da documentação (docs.cakto.com.br/conceitos/webhooks).
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  avisoVeioDaCakto,
  decisaoDoEvento,
  lerAvisoDeAssinatura,
  motivoDaSuspensao,
  produtoEhDaAssinatura,
  produtosDaAssinatura,
} from "./assinatura-cakto";

const SEGREDO = "b3f1a9c2-7b4d-4a8e-9f01-2c6d5b8a4e37";
const AVISO = {
  secret: SEGREDO,
  event: "purchase_approved",
  data: {
    id: "b3df956e-1998-4322-b091-ac0c54f7b4ba",
    refId: "4852F91",
    status: "paid",
    customer: { id: 481920, name: "John Doe", email: "John.Doe@Example.com", phone: "5534999999999" },
    product: { id: "cd287b31-d4b7-4e94-858a-96e05ce2f4a2", short_id: "42bruPi", name: "Plano Mensal", type: "subscription" },
    offer: { id: "a8BcHrY", name: "Mensal", price: 197 },
    subscription: { id: "sub_1" },
  },
};

describe("o que cada evento decide", () => {
  it("pagou, renovou, retomou ou recuperou o atraso: libera", () => {
    for (const e of ["purchase_approved", "subscription_renewed", "subscription_resumed", "subscription_late_recovered"]) {
      expect(decisaoDoEvento(e)).toBe("ativar");
    }
  });

  it("cancelou, atrasou, pausou, reembolso ou chargeback: suspende, com motivo legível", () => {
    for (const e of ["subscription_canceled", "subscription_late", "subscription_paused", "refund", "chargeback"]) {
      expect(decisaoDoEvento(e)).toBe("suspender");
      expect(motivoDaSuspensao(e)).toMatch(/Cakto/);
    }
  });

  it("tentativa de renovação recusada NÃO suspende — a Cakto tenta de novo", () => {
    expect(decisaoDoEvento("subscription_renewal_refused")).toBe("ignorar");
  });

  it("o resto não tem efeito — inclusive nome que tenta passar por propriedade herdada", () => {
    for (const e of ["pix_gerado", "checkout_abandonment", "subscription_created", "refund_requested", "", "toString", "constructor"]) {
      expect(decisaoDoEvento(e)).toBe("ignorar");
      expect(motivoDaSuspensao(e)).toBeUndefined();
    }
  });
});

describe("leitura do aviso", () => {
  it("tira o cliente (e-mail em minúsculas), o produto e a oferta", () => {
    expect(lerAvisoDeAssinatura(AVISO)).toEqual({
      evento: "purchase_approved",
      pedidoId: "b3df956e-1998-4322-b091-ac0c54f7b4ba",
      produto: { id: "cd287b31-d4b7-4e94-858a-96e05ce2f4a2", shortId: "42bruPi", nome: "Plano Mensal" },
      ofertaId: "a8BcHrY",
      cliente: { nome: "John Doe", email: "john.doe@example.com" },
    });
  });

  it("sem e-mail do cliente não há empresa a achar", () => {
    expect(lerAvisoDeAssinatura({ ...AVISO, data: { ...AVISO.data, customer: { name: "Sem e-mail" } } })).toBeNull();
    expect(lerAvisoDeAssinatura({ event: "purchase_approved", data: "texto" })).toBeNull();
    expect(lerAvisoDeAssinatura(null)).toBeNull();
  });
});

describe("o produto da assinatura", () => {
  const aviso = lerAvisoDeAssinatura(AVISO)!;

  it("a lista do .env aceita espaços, vírgulas sobrando e caixa diferente", () => {
    expect(produtosDaAssinatura(" A8BcHrY , ,42bruPi,")).toEqual(["a8bchry", "42brupi"]);
    expect(produtosDaAssinatura("")).toEqual([]);
  });

  it("casa pelo id do produto, pelo código curto ou pelo código da oferta", () => {
    expect(produtoEhDaAssinatura(aviso, ["cd287b31-d4b7-4e94-858a-96e05ce2f4a2"])).toBe(true);
    expect(produtoEhDaAssinatura(aviso, ["42brupi"])).toBe(true);
    expect(produtoEhDaAssinatura(aviso, ["a8bchry"])).toBe(true);
  });

  it("outro produto da mesma conta NÃO é a assinatura; lista vazia não casa com nada", () => {
    expect(produtoEhDaAssinatura(aviso, ["outro-produto"])).toBe(false);
    expect(produtoEhDaAssinatura(aviso, [])).toBe(false);
  });
});

describe("o aviso veio da Cakto?", () => {
  const corpoCru = JSON.stringify(AVISO);
  const agoraMs = 1_800_000_000_000;
  const carimbo = String(agoraMs / 1000);
  const assinar = (c: string, corpo = corpoCru, segredo = SEGREDO) =>
    `v1=${createHmac("sha256", segredo).update(`${c}.${corpo}`).digest("hex")}`;
  const base = { corpoCru, payload: AVISO, segredo: SEGREDO, agoraMs };

  it("assinatura do cabeçalho certa: aceita", () => {
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar(carimbo), carimbo })).toBe(true);
  });

  it("corpo adulterado depois de assinado: recusa — mesmo com o segredo certo dentro dele", () => {
    const adulterado = corpoCru.replace("john.doe", "invasor").replace("John.Doe", "invasor");
    expect(
      avisoVeioDaCakto({ ...base, corpoCru: adulterado, payload: JSON.parse(adulterado), assinatura: assinar(carimbo), carimbo }),
    ).toBe(false);
  });

  it("aviso antigo repetido (carimbo fora de 5 minutos): recusa", () => {
    const velho = String(agoraMs / 1000 - 301);
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar(velho), carimbo: velho })).toBe(false);
    const limite = String(agoraMs / 1000 - 299);
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar(limite), carimbo: limite })).toBe(true);
  });

  it("cabeçalho presente e errado NÃO cai para o segredo do corpo", () => {
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar(carimbo, corpoCru, "outro-segredo"), carimbo })).toBe(false);
    expect(avisoVeioDaCakto({ ...base, assinatura: "v1=abc", carimbo })).toBe(false);
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar(carimbo), carimbo: null })).toBe(false);
    expect(avisoVeioDaCakto({ ...base, assinatura: assinar("não-é-número"), carimbo: "não-é-número" })).toBe(false);
  });

  it("sem cabeçalho: vale o segredo devolvido no corpo", () => {
    expect(avisoVeioDaCakto({ ...base, assinatura: null, carimbo: null })).toBe(true);
    expect(avisoVeioDaCakto({ ...base, payload: { ...AVISO, secret: "errado" }, assinatura: null, carimbo: null })).toBe(false);
    expect(avisoVeioDaCakto({ ...base, payload: { ...AVISO, secret: undefined }, assinatura: null, carimbo: null })).toBe(false);
  });

  it("instalação sem segredo não aceita nada", () => {
    expect(avisoVeioDaCakto({ ...base, segredo: "", assinatura: null, carimbo: null })).toBe(false);
  });
});
