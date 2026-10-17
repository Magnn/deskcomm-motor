import { describe, expect, it } from "vitest";

import { etapaDaVez, lerEtapas, linhaDoTempo, MAXIMO_DE_ETAPAS } from "@/lib/area-do-cliente/etapas";
import { chavesDoProduto, trabalhosComEtapas } from "@/lib/area-do-cliente/dados";
import { servicoDaAreaParcialSchema, servicoDaAreaSchema } from "@/lib/area-do-cliente/servicos";

const sete = Array.from({ length: 7 }, (_, i) => ({ titulo: `${i + 1}ª noite`, orientacao: "vela branca às 21h" }));

describe("as etapas do trabalho", () => {
  it("lê a coluna sem lançar: formato estranho vira lista vazia", () => {
    expect(lerEtapas(sete)).toHaveLength(7);
    expect(lerEtapas(null)).toEqual([]);
    expect(lerEtapas({ titulo: "x" })).toEqual([]);
    expect(lerEtapas([{ titulo: "" }])).toEqual([]);
    expect(lerEtapas(Array.from({ length: MAXIMO_DE_ETAPAS + 1 }, () => ({ titulo: "x" })))).toEqual([]);
  });

  it("feitas, depois a primeira que falta como 'agora', o resto como 'depois'", () => {
    const linha = linhaDoTempo(sete, new Map([[0, "2026-10-08T21:00:00Z"], [1, "2026-10-09T21:00:00Z"]]));
    expect(linha.map((e) => e.estado)).toEqual(["feita", "feita", "agora", "depois", "depois", "depois", "depois"]);
    expect(linha.at(0)?.feitaEm).toBe("2026-10-08T21:00:00Z");
    expect(etapaDaVez(linha)?.titulo).toBe("3ª noite");
  });

  it("marcada fora de ordem: a da vez continua sendo a primeira que falta", () => {
    const linha = linhaDoTempo(sete, new Map([[0, "a"], [3, "b"]]));
    expect(linha.map((e) => e.estado)).toEqual(["feita", "agora", "depois", "feita", "depois", "depois", "depois"]);
    expect(etapaDaVez(linha)?.indice).toBe(1);
  });

  it("todas feitas: não há etapa da vez", () => {
    const linha = linhaDoTempo(sete.slice(0, 2), new Map([[0, "a"], [1, "b"]]));
    expect(etapaDaVez(linha)).toBeNull();
  });
});

describe("o serviço da vitrine", () => {
  it("a edição parcial não reaplica os valores padrão (mudar só o preço não mexe no resto)", () => {
    expect(servicoDaAreaParcialSchema.parse({ preco_cents: 500 })).toEqual({ preco_cents: 500 });
  });

  it("o cadastro completo ainda recebe os padrões, com as etapas vazias", () => {
    const novo = servicoDaAreaSchema.parse({ nome: "Desate dos 7 Nós", preco_cents: 13000, link_checkout: "https://pagar.exemplo/x" });
    expect(novo).toMatchObject({ currency: "BRL", destaque: false, ativo: true, posicao: 0, etapas: [] });
  });
});

describe("os trabalhos com etapas de quem comprou", () => {
  const compra = (id: string, produto: string | null, quando: string, estornada = false) =>
    ({ id, produto, valor_cents: 13000, currency: "BRL", quando, estornada });

  it("liga a compra ao serviço pelo nome, também fora da vitrine, e marca o que a pessoa fez", () => {
    const t = trabalhosComEtapas(
      [compra("c1", "Desate dos 7 Nós", "2026-10-08T12:00:00Z")],
      [{ id: "s1", nome: "Desate dos 7 nós", etapas: sete }],
      [{ servico_id: "s1", indice: 0, feita_em: "2026-10-08T21:00:00Z" }],
    );
    expect(t).toHaveLength(1);
    expect(t.at(0)?.etapas.map((e) => e.estado).slice(0, 3)).toEqual(["feita", "agora", "depois"]);
  });

  it("deixa de fora compra devolvida, produto sem serviço, serviço sem etapas, e repete o serviço uma vez só", () => {
    const t = trabalhosComEtapas(
      [
        compra("c1", "Desate dos 7 Nós", "2026-10-08T12:00:00Z", true),
        compra("c2", "Leitura das 3 cartas", "2026-10-09T12:00:00Z"),
        compra("c3", "Sem cadastro", "2026-10-10T12:00:00Z"),
        compra("c4", "Abertura do Coração", "2026-10-11T12:00:00Z"),
        compra("c5", "Abertura do Coração", "2026-10-12T12:00:00Z"),
      ],
      [
        { id: "s1", nome: "Desate dos 7 Nós", etapas: sete },
        { id: "s2", nome: "Leitura das 3 cartas", etapas: [] },
        { id: "s3", nome: "Abertura do Coração", etapas: sete.slice(0, 3) },
      ],
      [],
    );
    expect(t.map((x) => x.servicoId)).toEqual(["s3"]);
  });
});

describe("o nome do produto no checkout", () => {
  it("'Categoria: Trabalho' também liga ao serviço 'Trabalho'", () => {
    expect(chavesDoProduto("Trabalho Espiritual: Abertura do Coração")).toEqual(["trabalho-espiritual-abertura-do-coracao", "abertura-do-coracao"]);
    expect(chavesDoProduto("Abertura do Coração")).toEqual(["abertura-do-coracao"]);
    const t = trabalhosComEtapas(
      [{ id: "c1", produto: "Trabalho Espiritual: Abertura do Coração", valor_cents: 6000, currency: "BRL", quando: "2026-10-10T12:00:00Z", estornada: false }],
      [{ id: "s1", nome: "Abertura do Coração", etapas: sete.slice(0, 3) }],
      [],
    );
    expect(t.map((x) => x.servicoId)).toEqual(["s1"]);
  });
});
