import { describe, expect, it } from "vitest";

import { escolherChavePrincipal, type AgenteComChave } from "./chave-principal-da-organizacao";

const ag = (id: string, key: string, extra: Partial<AgenteComChave> = {}): AgenteComChave => ({
  id,
  priority: 0,
  published_version_id: "v",
  config: { pricing: { pix_key: { key, holder: `titular ${id}`, city: "Porto Velho", primary: true } as never } },
  ...extra,
});

describe("escolherChavePrincipal — uma chave só, sem sorteio", () => {
  it("o agente publicado vence o rascunho esquecido com a chave antiga", () => {
    const r = escolherChavePrincipal([ag("a", "62917956000100", { published_version_id: null }), ag("b", "+5569993677810")]);
    expect(r?.key).toBe("+5569993677810");
  });
  it("entre publicados, a maior prioridade (a mesma do despacho); empate desfeito pelo id, sempre igual", () => {
    expect(escolherChavePrincipal([ag("a", "k1", { priority: 1 }), ag("b", "k2", { priority: 5 })])?.key).toBe("k2");
    expect(escolherChavePrincipal([ag("b", "k2"), ag("a", "k1")])?.key).toBe("k1");
  });
  it("chave não principal não conta; nenhuma → null", () => {
    const naoPrincipal = ag("a", "k1");
    (naoPrincipal.config!.pricing!.pix_key as { primary: boolean }).primary = false;
    expect(escolherChavePrincipal([naoPrincipal])).toBeNull();
    expect(escolherChavePrincipal([])).toBeNull();
  });
});
