import { describe, expect, it } from "vitest";

import { textoDoCatalogo } from "@/lib/waha/ingest";

// Item e carrinho do catálogo do WhatsApp Business chegam sem `body` e sem mídia; antes eram descartados
// em silêncio pela guarda do inbound (16/11/2026). Formas do NOWEB: `productMessage` e `orderMessage`.
describe("mensagem do catálogo do WhatsApp", () => {
  it("produto vira texto com o nome e o preço", () => {
    const msg = {
      productMessage: {
        product: { title: "Abertura do Coração", priceAmount1000: 130000, currencyCode: "BRL", productId: "123" },
        businessOwnerJid: "556981105076@s.whatsapp.net",
      },
    };
    expect(textoDoCatalogo(msg)).toBe("[Produto do catálogo] Abertura do Coração — R$ 130,00");
  });

  it("preço em Long e promoção, com o recado que a cliente escreveu", () => {
    const msg = {
      productMessage: {
        product: { title: "Corte de Laços", priceAmount1000: { low: 60000, high: 0 }, salePriceAmount1000: "47000" },
        body: "quero esse",
      },
    };
    expect(textoDoCatalogo(msg)).toBe("[Produto do catálogo] Corte de Laços — R$ 47,00\nquero esse");
  });

  it("produto sem nome não vira mensagem", () => {
    expect(textoDoCatalogo({ productMessage: { product: {} } })).toBeNull();
  });

  it("carrinho vira texto com a quantidade e o total", () => {
    const msg = { orderMessage: { itemCount: 2, totalAmount1000: 157000, totalCurrencyCode: "BRL", message: "pode ser no pix?" } };
    expect(textoDoCatalogo(msg)).toBe("[Carrinho do catálogo] 2 itens, total R$ 157,00\npode ser no pix?");
  });

  it("carrinho sem números ainda vira mensagem", () => {
    expect(textoDoCatalogo({ orderMessage: {} })).toBe("[Carrinho do catálogo] pedido enviado");
  });

  it("outras mensagens seguem como estavam", () => {
    expect(textoDoCatalogo({ conversation: "oi" })).toBeNull();
  });
});
