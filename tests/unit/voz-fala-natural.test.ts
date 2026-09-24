/**
 * A VOZ SOA COMO GENTE — o que separa uma nota de voz de robô de uma de pessoa.
 *
 * Três coisas medidas aqui:
 *  - o valor em reais sai POR EXTENSO ("cento e trinta reais"), não "erre cifrão um três zero";
 *  - a biblioteca da ElevenLabs devolve só voz que se declara brasileira (português de
 *    Portugal e do Brasil vêm misturados) — e não some com a lista se o campo faltar;
 *  - o ajuste de estilo chega ao provedor.
 */
import { describe, expect, it } from "vitest";

import { numeroPorExtenso, valoresEmReaisPorExtenso } from "@/lib/voz/extenso";
import { corpoDaSinteseElevenLabs, vozesDaBiblioteca } from "@/lib/voz/provedores/elevenlabs";
import { textoParaFala } from "@/lib/voz/sintetizar";
import { explicarErroDeVoz, ErroDeVoz } from "@/lib/voz/erros";
import { erroDaResposta } from "@/lib/voz/http";

describe("numeroPorExtenso", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [19, "dezenove"],
    [21, "vinte e um"],
    [100, "cem"],
    [101, "cento e um"],
    [130, "cento e trinta"],
    [200, "duzentos"],
    [999, "novecentos e noventa e nove"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1100, "mil e cem"],
    [1101, "mil cento e um"],
    [2500, "dois mil e quinhentos"],
    [12_345, "doze mil trezentos e quarenta e cinco"],
    [999_999, "novecentos e noventa e nove mil novecentos e noventa e nove"],
  ])("%i → %s", (n, esperado) => {
    expect(numeroPorExtenso(n)).toBe(esperado);
  });

  it("o que não cobre volta null (o trecho fica como veio)", () => {
    expect(numeroPorExtenso(1_000_000)).toBeNull();
    expect(numeroPorExtenso(-3)).toBeNull();
    expect(numeroPorExtenso(1.5)).toBeNull();
  });
});

describe("valoresEmReaisPorExtenso", () => {
  it("R$ 130 vira cento e trinta reais — o caso da oferta", () => {
    expect(valoresEmReaisPorExtenso("O trabalho custa R$ 130, pagamento único.")).toBe(
      "O trabalho custa cento e trinta reais, pagamento único.",
    );
  });

  it("centavos, milhar com ponto e valor sem espaço", () => {
    expect(valoresEmReaisPorExtenso("R$1.299,90")).toBe("mil duzentos e noventa e nove reais e noventa centavos");
    expect(valoresEmReaisPorExtenso("R$ 10,5")).toBe("dez reais e cinquenta centavos");
    expect(valoresEmReaisPorExtenso("R$ 0,50")).toBe("cinquenta centavos");
    expect(valoresEmReaisPorExtenso("R$ 1")).toBe("um real");
  });

  it("texto sem valor não é tocado", () => {
    expect(valoresEmReaisPorExtenso("Em 3 noites você termina.")).toBe("Em 3 noites você termina.");
  });
});

describe("textoParaFala", () => {
  it("valor por extenso, sem link, sem emoji e com pausa única no lugar de reticências", () => {
    const fala = textoParaFala("O trabalho custa R$ 130... pagamento único 🌙\nhttps://pay.cakto.com.br/abc_123");
    expect(fala).not.toMatch(/R\$|https?:|🌙|\.\.\./);
    expect(fala).toContain("cento e trinta reais");
    expect(fala).toContain("…");
  });
});

describe("vozesDaBiblioteca", () => {
  const base = { public_owner_id: "dono", voice_id: "v", name: "Voz" };

  it("fica só com as brasileiras quando o provedor declara o sotaque", () => {
    const r = vozesDaBiblioteca([
      { ...base, voice_id: "a", name: "Ana", accent: "brazilian", gender: "female", locale: "pt-BR", preview_url: "https://x/a.mp3" },
      { ...base, voice_id: "b", name: "Beatriz", accent: "european", gender: "female", locale: "pt-PT" },
    ]);
    expect(r.map((v) => v.nome)).toEqual(["Ana"]);
    expect(r[0]).toMatchObject({ genero: "feminina", sotaque: "brazilian", previewUrl: "https://x/a.mp3", publicOwnerId: "dono" });
  });

  it("se nenhuma voz da página declara sotaque, não some com a lista", () => {
    const r = vozesDaBiblioteca([{ ...base, voice_id: "a", name: "Ana" }, { ...base, voice_id: "b", name: "Bia" }]);
    expect(r).toHaveLength(2);
  });

  it("descarta o que não tem o mínimo para adicionar (dono, id ou nome)", () => {
    const r = vozesDaBiblioteca([{ voice_id: "a", name: "Sem dono" }, { public_owner_id: "d", name: "Sem id" }, { ...base }]);
    expect(r.map((v) => v.nome)).toEqual(["Voz"]);
  });
});

describe("estilo da ElevenLabs", () => {
  it("`style` vai em voice_settings junto com estabilidade e velocidade", () => {
    const corpo = corpoDaSinteseElevenLabs({
      apiKey: "k",
      vozId: "v",
      texto: "oi",
      formato: "nota_de_voz",
      ajustes: { stability: 0.35, similarity_boost: 0.8, style: 0.2, speed: 0.95 },
    });
    expect(corpo.voice_settings).toMatchObject({ stability: 0.35, similarity_boost: 0.8, style: 0.2, speed: 0.95 });
  });

  it("sem `style` no config, o campo não é enviado (o provedor usa o padrão dele)", () => {
    const corpo = corpoDaSinteseElevenLabs({ apiKey: "k", vozId: "v", texto: "oi", formato: "nota_de_voz" });
    expect(corpo.voice_settings).not.toHaveProperty("style");
  });
});

describe("erro da biblioteca", () => {
  it("402/403 na biblioteca vira `sem_permissao_de_biblioteca`, com a explicação em português", async () => {
    const e = await erroDaResposta(new Response("{}", { status: 402 }), "biblioteca");
    expect(e).toBeInstanceOf(ErroDeVoz);
    expect(e.codigo).toBe("sem_permissao_de_biblioteca");
    expect(explicarErroDeVoz(e)).toMatch(/biblioteca/);
  });

  it("401 continua sendo chave inválida, em qualquer contexto", async () => {
    const e = await erroDaResposta(new Response("{}", { status: 401 }), "biblioteca");
    expect(e.codigo).toBe("chave_invalida");
  });
});
