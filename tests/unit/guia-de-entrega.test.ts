import { describe, expect, it, vi } from "vitest";

import {
  TETO_DO_GUIA,
  carregarGuiaDeEntrega,
  montarBlocoDoGuia,
  trabalhoPagoDasTags,
  type TrechoDoConhecimento,
} from "@/lib/entrega/guia-de-entrega";

const CORACAO = { slug: "abertura-do-coracao", nome: "Abertura do Coração" };

describe("trabalhoPagoDasTags — quem pagou e o quê", () => {
  it("lê o trabalho quando tem `pago` e `produto:<slug>`", () => {
    expect(trabalhoPagoDasTags(["lead", "pago", "produto:abertura-do-coracao", "compra:123"])).toEqual(CORACAO);
    expect(trabalhoPagoDasTags(["produto:limpeza-e-protecao", "pago"])?.nome).toBe("Limpeza e Proteção");
  });

  it("sem `pago` não entrega nada, mesmo com a tag do produto (quem só DISSE que pagou)", () => {
    expect(trabalhoPagoDasTags(["produto:abertura-do-coracao"])).toBeNull();
    expect(trabalhoPagoDasTags([])).toBeNull();
    expect(trabalhoPagoDasTags(null)).toBeNull();
    expect(trabalhoPagoDasTags(undefined)).toBeNull();
  });

  it("produto desconhecido (`produto:outro`) não é um dos trabalhos", () => {
    expect(trabalhoPagoDasTags(["pago", "produto:outro"])).toBeNull();
    expect(trabalhoPagoDasTags(["pago"])).toBeNull();
  });

  it("aceita os quatro trabalhos", () => {
    for (const slug of ["abertura-do-coracao", "abertura-da-prosperidade", "limpeza-e-protecao", "desbloqueio-dos-caminhos"]) {
      expect(trabalhoPagoDasTags(["pago", `produto:${slug}`])?.slug).toBe(slug);
    }
  });
});

describe("montarBlocoDoGuia", () => {
  it("vazio quando não há trecho — nada a injetar", () => {
    expect(montarBlocoDoGuia(CORACAO, [])).toBe("");
  });

  it("nomeia o trabalho pago e manda entregar só ele, uma etapa por vez", () => {
    const b = montarBlocoDoGuia(CORACAO, ["ETAPA 1: acender a vela"]);
    expect(b).toContain('PAGOU "Abertura do Coração"');
    expect(b).toContain("ESTE trabalho e nenhum outro");
    expect(b).toContain("UMA coisa por mensagem");
    expect(b).toContain("ETAPA 1: acender a vela");
  });

  it("respeita o teto de tamanho", () => {
    const b = montarBlocoDoGuia(CORACAO, ["x".repeat(TETO_DO_GUIA * 3)]);
    expect(b.length).toBeLessThan(TETO_DO_GUIA + 1000);
  });
});

describe("carregarGuiaDeEntrega — o que entra no prompt", () => {
  const t = (source_name: string, content: string): TrechoDoConhecimento => ({ source_name, content });

  it("busca as regras gerais e o guia do trabalho pago", async () => {
    const buscar = vi.fn(async (q: string) =>
      q.includes("regras gerais")
        ? [t("Entregável: regras gerais", "REGRA: uma etapa por vez")]
        : [t("Entregável: Abertura do Coração", "GUIA: vela rosa")],
    );
    const b = await carregarGuiaDeEntrega({ buscar }, CORACAO);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(buscar.mock.calls[1]?.[0]).toContain("Abertura do Coração");
    expect(b).toContain("REGRA: uma etapa por vez");
    expect(b).toContain("GUIA: vela rosa");
  });

  it("descarta guia de OUTRO trabalho (a busca semântica traz vizinhos parecidos)", async () => {
    const buscar = async () => [
      t("Entregável: Abertura da Prosperidade", "GUIA DA PROSPERIDADE"),
      t("Entregável: Abertura do Coração", "GUIA DO CORAÇÃO"),
    ];
    const b = await carregarGuiaDeEntrega({ buscar }, CORACAO);
    expect(b).toContain("GUIA DO CORAÇÃO");
    expect(b).not.toContain("GUIA DA PROSPERIDADE");
  });

  it("descarta materiais que não são de entrega (ficha de oferta, FAQ)", async () => {
    const buscar = async () => [t("Ficha da oferta", "PREÇO R$ 130"), t("Entregável: regras gerais", "REGRA")];
    const b = await carregarGuiaDeEntrega({ buscar }, CORACAO);
    expect(b).toContain("REGRA");
    expect(b).not.toContain("PREÇO");
  });

  it("não repete o mesmo trecho vindo das duas buscas", async () => {
    const buscar = async () => [t("Entregável: regras gerais", "REGRA IGUAL")];
    const b = await carregarGuiaDeEntrega({ buscar }, CORACAO);
    expect(b.split("REGRA IGUAL")).toHaveLength(2);
  });

  it("sem nenhum trecho de entrega, devolve vazio (o turno segue sem bloco)", async () => {
    expect(await carregarGuiaDeEntrega({ buscar: async () => [] }, CORACAO)).toBe("");
    expect(await carregarGuiaDeEntrega({ buscar: async () => [t("Outro", "x")] }, CORACAO)).toBe("");
  });

  it("propaga a falha da busca — quem chama decide (o turno a captura e segue)", async () => {
    await expect(
      carregarGuiaDeEntrega({ buscar: async () => Promise.reject(new Error("embed fora")) }, CORACAO),
    ).rejects.toThrow("embed fora");
  });
});
