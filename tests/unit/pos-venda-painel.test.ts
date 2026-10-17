import { describe, expect, it } from "vitest";

import type { ProdutoDoCatalogo } from "@/lib/catalogo/tipos";
import {
  atribuirVendas,
  contarOfertas,
  montarPainel,
  produtosDosCatalogos,
  textoDoResumoSemanal,
  type MensagemQueSaiu,
} from "@/lib/resultado/pos-venda";

/**
 * O painel do pós-venda: o que o catálogo rendeu com quem já comprou.
 *   1. oferecido = o agente CITOU o produto (a oferta nomeia antes do link); pediu link = o link saiu;
 *   2. compra = `charge` cujo produto casa pela mesma regra da marca no contato; estorno entra negativo;
 *   3. dois produtos à mesma cliente no mesmo dia (no fuso da organização) é sinal de defeito;
 *   4. receita média por cliente = de sempre ÷ quem já pagou.
 */

const p = (nome: string, preco: number, link: string): ProdutoDoCatalogo => ({
  nome,
  preco_cents: preco,
  link,
  entrega: "material",
  pede: [],
  espera_horas: 0,
  ativo: true,
});
const ORACAO = p("Oração dos Sonhos", 3500, "https://pay.ex/oracao");
const PROSPERIDADE = p("Abertura da Prosperidade", 6000, "https://pay.ex/prosperidade");
const PRODUTOS = [ORACAO, PROSPERIDADE];
const FUSO = "America/Rio_Branco";
const msg = (contactId: string, body: string, criadaEm = "2026-10-18T15:00:00Z"): MensagemQueSaiu => ({ contactId, body, criadaEm });

describe("contarOfertas", () => {
  it("citar o produto é oferecer, sem acento e sem caixa; o link é o pedido", () => {
    const { porProduto } = contarOfertas(
      [
        msg("ana", "Pelo que você me contou, tem algo que combina: a ORACAO DOS SONHOS. Fica R$ 35. Quer?"),
        msg("ana", "Aqui está: https://pay.ex/oracao"),
        msg("bia", "Tem a Oração dos Sonhos, que combina com você."),
      ],
      PRODUTOS,
      FUSO,
    );
    const o = porProduto.get("oracao-dos-sonhos")!;
    expect(o.oferecidas.size).toBe(2);
    expect(o.links.size).toBe(1);
    expect(porProduto.get("abertura-da-prosperidade")!.oferecidas.size).toBe(0);
  });

  it("a mesma cliente ofertada duas vezes conta uma", () => {
    const { porProduto } = contarOfertas([msg("ana", "Oração dos Sonhos"), msg("ana", "Oração dos Sonhos de novo")], PRODUTOS, FUSO);
    expect(porProduto.get("oracao-dos-sonhos")!.oferecidas.size).toBe(1);
  });

  it("dois produtos à mesma cliente no mesmo dia é repetição; em dias diferentes, não", () => {
    const mesmoDia = contarOfertas([msg("ana", "Oração dos Sonhos"), msg("ana", "Abertura da Prosperidade")], PRODUTOS, FUSO);
    expect(mesmoDia.repetidasNoDia).toBe(1);
    const diasDiferentes = contarOfertas(
      [msg("ana", "Oração dos Sonhos", "2026-10-18T15:00:00Z"), msg("ana", "Abertura da Prosperidade", "2026-10-19T15:00:00Z")],
      PRODUTOS,
      FUSO,
    );
    expect(diasDiferentes.repetidasNoDia).toBe(0);
  });

  it("o dia é o da organização: 01:00 UTC ainda é a véspera em Rio Branco", () => {
    const r = contarOfertas(
      [msg("ana", "Oração dos Sonhos", "2026-10-18T20:00:00Z"), msg("ana", "Abertura da Prosperidade", "2026-10-19T01:00:00Z")],
      PRODUTOS,
      FUSO,
    );
    expect(r.repetidasNoDia).toBe(1);
  });
});

describe("atribuirVendas", () => {
  it("o nome do checkout com prefixo casa com o produto; estorno entra negativo e não é compra", () => {
    const v = atribuirVendas(
      [
        { contactId: "ana", tipo: "charge", centavos: 6000, produto: "Trabalho Espiritual: Abertura da Prosperidade" },
        { contactId: "bia", tipo: "charge", centavos: 3500, produto: "Oração dos Sonhos" },
        { contactId: "bia", tipo: "refund", centavos: -3500, produto: "Oração dos Sonhos" },
        { contactId: "cid", tipo: "charge", centavos: 13000, produto: "Abertura do Coração" },
        { contactId: "dan", tipo: "charge", centavos: 500, produto: null },
      ],
      PRODUTOS,
    );
    expect(v.get("abertura-da-prosperidade")).toEqual({ compras: 1, receitaCentavos: 6000 });
    expect(v.get("oracao-dos-sonhos")).toEqual({ compras: 1, receitaCentavos: 0 });
  });
});

describe("montarPainel e produtosDosCatalogos", () => {
  it("receita média por cliente de sempre; sem cliente, zero", () => {
    const painel = montarPainel(PRODUTOS, [], [], { clientes: 4, receitaCentavos: 100_000 }, FUSO, false);
    expect(painel.receitaMediaPorClienteCentavos).toBe(25_000);
    expect(montarPainel(PRODUTOS, [], [], { clientes: 0, receitaCentavos: 0 }, FUSO, false).receitaMediaPorClienteCentavos).toBe(0);
  });

  it("junta os catálogos LIGADOS dos agentes, sem rascunho e sem repetir nome", () => {
    const lista = produtosDosCatalogos([
      { catalog: { enabled: true, produtos: [ORACAO, { ...PROSPERIDADE, ativo: false }] } },
      { catalog: { enabled: true, produtos: [{ ...ORACAO, preco_cents: 9900 }, PROSPERIDADE] } },
      { catalog: { enabled: false, produtos: [p("Desligado", 1000, "https://pay.ex/x")] } },
      {},
    ]);
    expect(lista.map((x) => [x.nome, x.preco_cents])).toEqual([
      ["Oração dos Sonhos", 3500],
      ["Abertura da Prosperidade", 6000],
    ]);
  });
});

describe("textoDoResumoSemanal", () => {
  const reais = (c: number) => `R$ ${(c / 100).toFixed(2)}`;

  it("diz a semana, compara com a anterior e só lista produto que teve movimento", () => {
    const semana = montarPainel(
      PRODUTOS,
      [msg("ana", "Oração dos Sonhos"), msg("ana", "https://pay.ex/oracao")],
      [{ contactId: "ana", tipo: "charge", centavos: 3500, produto: "Oração dos Sonhos" }],
      { clientes: 2, receitaCentavos: 16500 },
      FUSO,
      false,
    );
    const anterior = montarPainel(PRODUTOS, [], [], { clientes: 1, receitaCentavos: 13000 }, FUSO, false);
    const { titulo, corpo } = textoDoResumoSemanal(semana, anterior, reais);
    expect(titulo).toBe("Pós-venda da semana");
    expect(corpo).toContain("1 ofertas, 1 compras, R$ 35.00 (semana anterior: R$ 0.00)");
    expect(corpo).toContain("Oração dos Sonhos: oferecido a 1, 1 pediram o link, 1 compraram (R$ 35.00).");
    expect(corpo).not.toContain("Abertura da Prosperidade");
    expect(corpo).toContain("Receita média por cliente, de sempre: R$ 82.50 (2 clientes).");
    expect(corpo).not.toContain("Atenção");
  });

  it("semana sem oferta diz isso, e a repetição no dia vira atenção", () => {
    const vazia = montarPainel(PRODUTOS, [], [], { clientes: 0, receitaCentavos: 0 }, FUSO, false);
    expect(textoDoResumoSemanal(vazia, null, reais).corpo).toContain("Nenhuma oferta de pós-venda saiu nesta semana.");
    const repetida = montarPainel(PRODUTOS, [msg("ana", "Oração dos Sonhos"), msg("ana", "Abertura da Prosperidade")], [], { clientes: 1, receitaCentavos: 0 }, FUSO, false);
    expect(textoDoResumoSemanal(repetida, null, reais).corpo).toContain("Atenção: 1 vez(es)");
  });
});
