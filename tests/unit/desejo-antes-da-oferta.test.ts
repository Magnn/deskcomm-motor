import { describe, expect, it } from "vitest";

import { blocoDaOfertaDoCatalogo } from "@/lib/catalogo/bloco-do-prompt";
import { motivoDaOfertaDaSequencia } from "@/lib/catalogo/proxima-da-sequencia";
import type { ProdutoDoCatalogo } from "@/lib/catalogo/tipos";
import { moldeComDesejo } from "@/lib/preco/molde-com-desejo";

const produto = {
  nome: "Oração dos Sonhos",
  preco_cents: 3500,
  link: "https://pay.example/x",
  descricao: "Uma oração antes de dormir para pedir clareza em sonho.",
  recebe: "a oração em imagem",
  ativo: true,
  espera_horas: 0,
} as unknown as ProdutoDoCatalogo;

describe("desejo antes do preço na oferta a quem já está na conversa", () => {
  it("o molde põe o desejo na 1ª bolha e o valor só na 2ª", () => {
    const m = moldeComDesejo("Oração dos Sonhos", "R$ 35", "clareza em sonho");
    expect(m.indexOf("DESEJO")).toBeLessThan(m.indexOf("R$ 35"));
    expect(m).toMatch(/1ª, o DESEJO, sem valor/);
    expect(m).toMatch(/clareza em sonho/);
    expect(m).toMatch(/Sem prometer resultado/);
  });

  it("a oferta diária do catálogo usa o molde com desejo, não o direto ao preço", () => {
    const b = blocoDaOfertaDoCatalogo({ produto, jaOferecida: false, diaria: true } as never);
    expect(b).toMatch(/1ª, o DESEJO, sem valor/);
    expect(b).not.toMatch(/tem algo que combina com este momento/);
  });

  it("a oferta da sequência também", () => {
    const m = motivoDaOfertaDaSequencia("Abertura do Coração", produto);
    expect(m).toMatch(/1ª, o DESEJO, sem valor/);
    expect(m).not.toMatch(/tem algo que combina/);
  });
});
