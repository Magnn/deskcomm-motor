/**
 * A leitura da mão pela foto (migration 0951): a resposta da IA vira as cinco linhas; a tela vê a do coração
 * de graça e só o que foi VISTO nas outras; sem pagar, a síntese e o passo não saem do servidor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LINHAS_DA_MAO, configDaMao, leituraNaTela, lerLeituraDaMao } from "@/lib/area-do-cliente/mao";
import { pedidoDaMao } from "@/lib/area-do-cliente/mao-ia";
import { PONTO_POR_ID } from "@/lib/ai/pontos/registro";
import { isPublicPath } from "@/lib/auth/public-paths";

const RAIZ = path.resolve(__dirname, "../..");
const resposta = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    eh_mao: true,
    linhas: Object.fromEntries(LINHAS_DA_MAO.map((l) => [l, { visto: `traço da ${l}`, leitura: `leitura da ${l}` }])),
    sintese: "a mão inteira",
    passo: "um passo",
    ...extra,
  });

describe("lerLeituraDaMao", () => {
  it("lê as cinco linhas na ordem, mesmo com texto em volta do JSON", () => {
    const l = lerLeituraDaMao(`Aqui está:\n${resposta()}\nobrigada`);
    expect(l).not.toBeNull();
    expect(l).not.toBe("nao_e_mao");
    if (l && l !== "nao_e_mao") {
      expect(l.linhas.map((x) => x.linha)).toEqual([...LINHAS_DA_MAO]);
      expect(l.linhas[0]).toEqual({ linha: "coracao", visto: "traço da coracao", leitura: "leitura da coracao" });
    }
  });

  it("foto que não é palma vira 'nao_e_mao' (nada é gravado nem cobrado)", () => {
    expect(lerLeituraDaMao('{"eh_mao": false}')).toBe("nao_e_mao");
  });

  it("resposta sem uma das linhas, sem síntese ou quebrada não serve", () => {
    const sem = JSON.parse(resposta()) as { linhas: Record<string, unknown> };
    delete sem.linhas.sol;
    expect(lerLeituraDaMao(JSON.stringify(sem))).toBeNull();
    expect(lerLeituraDaMao(resposta({ sintese: "" }))).toBeNull();
    expect(lerLeituraDaMao("não consegui")).toBeNull();
  });
});

describe("leituraNaTela", () => {
  const l = lerLeituraDaMao(resposta());
  if (!l || l === "nao_e_mao") throw new Error("fixture");

  it("antes de pagar: o coração inteiro; nas outras só o que foi visto; sem síntese nem passo", () => {
    const t = leituraNaTela(l, false);
    expect(t.linhas.find((x) => x.linha === "coracao")?.leitura).toBe("leitura da coracao");
    for (const x of t.linhas.filter((y) => y.linha !== "coracao")) {
      expect(x.leitura).toBeNull();
      expect(x.visto).toBe(`traço da ${x.linha}`);
    }
    expect(t.sintese).toBeNull();
    expect(t.passo).toBeNull();
  });

  it("paga: tudo aberto", () => {
    const t = leituraNaTela(l, true);
    expect(t.linhas.every((x) => x.leitura !== null)).toBe(true);
    expect(t.sintese).toBe("a mão inteira");
    expect(t.passo).toBe("um passo");
  });
});

describe("configDaMao", () => {
  it("sem bloco próprio segue a Mesa e custa R$ 15", () => {
    expect(configDaMao(undefined, { ativo: true })).toEqual({ ativo: true, preco_cents: 1500 });
    expect(configDaMao(undefined, undefined).ativo).toBe(false);
  });
  it("o bloco próprio manda", () => {
    expect(configDaMao({ ativo: false, preco_cents: 990 }, { ativo: true })).toEqual({ ativo: false, preco_cents: 990 });
  });
});

describe("o pedido à IA e o ponto", () => {
  it("proíbe falar de duração da vida, morte e doença", () => {
    const p = pedidoDaMao("Templo", "Ana");
    expect(p).toMatch(/Nunca fale de quanto tempo ela vai viver, de morte, de doença/);
    expect(p).toMatch(/"eh_mao": false/);
  });

  it("o ponto area_mao exige visão e registra o custo", () => {
    const ponto = PONTO_POR_ID.get("area_mao");
    expect(ponto?.exige.imagem).toBe(true);
    expect(ponto?.registraEm).toBe("llm_calls");
  });

  it("as rotas da mão atravessam o proxy", () => {
    expect(isPublicPath("/api/v1/area/publica/cigana/mao")).toBe(true);
    expect(isPublicPath("/api/v1/area/publica/cigana/mao/0d7c1c2e-4a51-4c38-9a0f-3b1f8a2c9e11")).toBe(true);
    expect(isPublicPath("/api/v1/area/publica/cigana/mao/0d7c1c2e-4a51-4c38-9a0f-3b1f8a2c9e11/liberar")).toBe(true);
  });

  it("o pagamento da Stripe libera a leitura da mão pelo id", () => {
    const src = readFileSync(path.join(RAIZ, "lib/area-do-cliente/compras-da-area.ts"), "utf8");
    expect(src).toMatch(/extra === EXTRA_DA_MAO/);
    expect(src).toMatch(/from\("area_maos"\)/);
  });
});
