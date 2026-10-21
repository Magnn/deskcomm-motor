import { describe, expect, it } from "vitest";

import { ofertaDaVez } from "./oferta-da-vez";
import { motivoDaOfertaDaSequencia, proximaDaSequencia } from "./proxima-da-sequencia";
import { catalogoSchema, type CatalogoConfig } from "./tipos";

const CATALOGO: CatalogoConfig = catalogoSchema.parse({
  enabled: true,
  oferta_diaria: true,
  produtos: [
    { nome: "Oração dos Sonhos", link: "https://pay.cakto.com.br/oracao", preco_cents: 3500, entrega: "material", espera_horas: 0, ativo: true, pede: [], recebe: "a oração em imagem" },
    { nome: "Sons Vocálicos", link: "https://pay.cakto.com.br/sons", preco_cents: 4500, entrega: "material", espera_horas: 0, depois_de: "Oração dos Sonhos", ativo: true, pede: [], recebe: "dois áudios" },
    { nome: "Limpeza e Proteção", link: "https://pay.cakto.com.br/limpeza", preco_cents: 6000, entrega: "material", espera_horas: 72, ativo: true, pede: [] },
  ],
});

describe("próxima da sequência", () => {
  it("quem comprou a Oração dos Sonhos recebe a oferta dos Sons Vocálicos", () => {
    const p = proximaDaSequencia(CATALOGO, "Oração dos Sonhos", ["pago", "produto:oracao-dos-sonhos"]);
    expect(p?.nome).toBe("Sons Vocálicos");
    expect(motivoDaOfertaDaSequencia("Oração dos Sonhos", p!)).toContain("R$ 45");
  });

  it("quem já tem os Sons, ou comprou outra coisa, não recebe", () => {
    expect(proximaDaSequencia(CATALOGO, "Oração dos Sonhos", ["produto:oracao-dos-sonhos", "produto:sons-vocalicos"])).toBeNull();
    expect(proximaDaSequencia(CATALOGO, "Abertura do Coração", ["produto:abertura-do-coracao"])).toBeNull();
    expect(proximaDaSequencia(null, "Oração dos Sonhos", [])).toBeNull();
  });
});

describe("oferta diária reconhece a oferta feita sem o link do catálogo", () => {
  const agora = new Date("2026-10-21T16:00:00Z");
  const compra = { tags: ["pago", "produto:oracao-dos-sonhos"], pagoEm: new Date("2026-10-21T15:51:00Z") };

  it("o link virou Pix, mas a fala com nome e valor conta como oferta de hoje", () => {
    const mensagens = [
      { direction: "outbound", body: "Pelo que você me contou, tem algo que combina: Sons Vocálicos. Fica R$ 45, pagamento único.", sent_at: "2026-10-21T15:55:00Z" },
    ];
    const o = ofertaDaVez(CATALOGO, compra, mensagens, ["Oração dos Sonhos", "Sons Vocálicos"], agora);
    expect(o?.produto.nome).toBe("Sons Vocálicos");
    expect(o?.jaOferecida).toBe(true);
  });

  it("sem fala nenhuma, a oferta de hoje ainda não foi feita", () => {
    const o = ofertaDaVez(CATALOGO, compra, [], ["Oração dos Sonhos", "Sons Vocálicos"], agora);
    expect(o?.jaOferecida).toBe(false);
  });
});
