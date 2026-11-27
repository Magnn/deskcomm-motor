import { describe, expect, it } from "vitest";

import { ofertaProativaSchema } from "./config";
import { anguloDaVez, escolherOferta, motivoDaOferta, type PessoaParaOferta } from "./decisao";
import { desempenhoDe, PESO_DA_MEDIA, valorDaOferta } from "./desempenho";

const AGORA = new Date("2026-11-27T15:00:00Z");
const DIA = 86_400_000;

const cfg = ofertaProativaSchema.parse({
  enabled: true,
  ofertas: [
    { id: "barata", motivo: "ofereça a pergunta nova, curta e pelo nome.", dias_entre_repeticoes: 5 },
    { id: "cara", motivo: "ofereça o trabalho completo, pelo nome e sem pressa.", dias_entre_repeticoes: 5 },
    {
      id: "com-caminhos",
      motivo: "ofereça a oração dos sonhos pelo nome, criando desejo.",
      angulos: ["a noite dela: o que ela sente quando deita.", "o sonho que volta: o que se repete.", "o despertar: acordar leve."],
      dias_entre_repeticoes: 5,
    },
  ],
});

const pessoa = (feitas: { id: string; dias: number }[] = []): PessoaParaOferta => ({
  comprou: true,
  produtosComprados: ["Abertura"],
  falas: ["oi"],
  saidas: [],
  ofertasFeitas: feitas.map((f) => ({ id: f.id, em: new Date(AGORA.getTime() - f.dias * DIA) })),
});

const desempenho = desempenhoDe([
  { id: "barata", ofertas: 1320, receita: 168_100 }, // R$ 1,27 por oferta
  { id: "cara", ofertas: 40, receita: 140_000 }, // R$ 35 por oferta
]);

describe("quanto cada oferta rende", () => {
  it("puxa para a média quem tem pouco envio, e oferta nunca enviada vale a média", () => {
    const media = (168_100 + 140_000) / 1360;
    expect(desempenho.media).toBeCloseTo(media);
    expect(valorDaOferta(desempenho, "cara")).toBeCloseTo((140_000 + PESO_DA_MEDIA * media) / (40 + PESO_DA_MEDIA));
    expect(valorDaOferta(desempenho, "nunca-saiu")).toBeCloseTo(media);
    expect(valorDaOferta(desempenho, "cara")).toBeGreaterThan(valorDaOferta(desempenho, "barata"));
  });
});

describe("a alavanca do ritmo", () => {
  it("no ritmo, a ordem é a de sempre; atrasada, vai primeiro a que mais rende", () => {
    const so = { ...cfg, ofertas: cfg.ofertas.slice(0, 2) };
    expect(escolherOferta(pessoa(), so, AGORA, [], null, { receita: false, desempenho }).oferta?.id).toBe("barata");
    expect(escolherOferta(pessoa(), so, AGORA, [], null, { receita: true, desempenho }).oferta?.id).toBe("cara");
  });

  it("oferta nunca enviada concorre com a média: passa da que rende pouco", () => {
    expect(escolherOferta(pessoa(), cfg, AGORA, [], null, { receita: true, desempenho }).oferta?.id).toBe("cara");
    const semCara = { ...cfg, ofertas: [cfg.ofertas[0]!, cfg.ofertas[2]!] };
    expect(escolherOferta(pessoa(), semCara, AGORA, [], null, { receita: true, desempenho }).oferta?.id).toBe("com-caminhos");
  });

  it("quem já ouviu todas continua ouvindo a de mais tempo, mesmo atrasada — sem insistir na mais cara", () => {
    const ouviu = pessoa([
      { id: "barata", dias: 20 },
      { id: "cara", dias: 6 },
      { id: "com-caminhos", dias: 8 },
    ]);
    expect(escolherOferta(ouviu, cfg, AGORA, [], null, { receita: true, desempenho }).oferta?.id).toBe("barata");
  });

  it("sem régua de desempenho, a alavanca não muda nada", () => {
    const so = { ...cfg, ofertas: cfg.ofertas.slice(0, 2) };
    expect(escolherOferta(pessoa(), so, AGORA, [], null, { receita: true, desempenho: null }).oferta?.id).toBe("barata");
  });
});

describe("caminhos da mesma oferta", () => {
  const o = cfg.ofertas[2]!;
  it("cada vez que ela recebe a oferta, um caminho diferente, em rodízio", () => {
    expect(anguloDaVez(o, pessoa())).toContain("a noite dela");
    expect(anguloDaVez(o, pessoa([{ id: "com-caminhos", dias: 10 }]))).toContain("o sonho que volta");
    expect(
      anguloDaVez(o, pessoa([{ id: "com-caminhos", dias: 30 }, { id: "com-caminhos", dias: 20 }, { id: "com-caminhos", dias: 10 }])),
    ).toContain("a noite dela");
    expect(anguloDaVez(cfg.ofertas[0]!, pessoa())).toBeNull();
  });

  it("o motivo leva o caminho e, para quem já ouviu, o pedido de não repetir", () => {
    const m = motivoDaOferta(o, o.motivo, "o sonho que volta: o que se repete.", true);
    expect(m).toContain("Desta vez, entre por este caminho: o sonho que volta");
    expect(m).toContain("não repita frase, imagem nem abertura");
    expect(m).toContain("Sem urgência inventada");
    expect(motivoDaOferta(o)).not.toContain("Desta vez");
  });
});
