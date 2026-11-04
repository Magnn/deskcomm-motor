import { describe, expect, it } from "vitest";

import { lerOfertaProativa, ofertaProativaSchema, type OfertaProativa } from "./config";
import { compraCabe, dentroDaFaixa, escolherOferta, motivoDaOferta, type PessoaParaOferta } from "./decisao";
import { ritmoPermite } from "@/lib/agent-engine/edge/crm/oferta-proativa";

const AGORA = new Date("2026-10-21T13:00:00Z"); // 09:00 em Porto Velho
const DIA = 24 * 3_600_000;

const cfg: OfertaProativa = ofertaProativaSchema.parse({
  enabled: true,
  ofertas: [
    {
      id: "sinastria",
      motivo: "ofereça o mapa do casal a quem comprou e falou de alguém",
      so_quem_comprou: true,
      agente_ja_disse: "carta\\s*[123]",
      cliente_disse: "marido|namorad",
      ja_tem_se_comprou: "sinastria",
    },
    {
      id: "pergunta_nova",
      motivo: "ofereça uma pergunta a mais às cartas por R$ 5",
      agente_ja_disse: "carta\\s*[123]",
      ja_ofertada_se_agente_disse: "pergunta nova",
    },
  ],
});

function pessoa(p: Partial<PessoaParaOferta> = {}): PessoaParaOferta {
  return {
    comprou: false,
    produtosComprados: [],
    falas: ["oi, quero saber do meu namorado"],
    saidas: [{ texto: "Carta 1: Os Amantes", em: new Date(AGORA.getTime() - 2 * DIA) }],
    ofertasFeitas: [],
    ...p,
  };
}

describe("escolherOferta", () => {
  it("a primeira da lista que cabe: comprou e falou de alguém → sinastria", () => {
    const e = escolherOferta(pessoa({ comprou: true, produtosComprados: ["Trabalho Espiritual"] }), cfg, AGORA);
    expect(e.oferta?.id).toBe("sinastria");
  });

  it("não comprou → pula a de quem comprou e cai na pergunta nova", () => {
    expect(escolherOferta(pessoa(), cfg, AGORA).oferta?.id).toBe("pergunta_nova");
  });

  it("já tem o produto → não recebe de novo", () => {
    const e = escolherOferta(pessoa({ comprou: true, produtosComprados: ["Sinastria Amorosa"] }), cfg, AGORA);
    expect(e.oferta?.id).toBe("pergunta_nova");
  });

  it("sem a leitura entregue, nenhuma cabe", () => {
    const e = escolherOferta(pessoa({ saidas: [{ texto: "Olá, me manda seu nome", em: AGORA }] }), cfg, AGORA);
    expect(e).toEqual({ oferta: null, porque: "nenhuma_cabe" });
  });

  it("ofertada há menos de dias_entre_repeticoes (pelo registro ou pelo que o agente disse) não repete", () => {
    expect(
      escolherOferta(pessoa({ ofertasFeitas: [{ id: "pergunta_nova", em: new Date(AGORA.getTime() - DIA) }] }), cfg, AGORA).oferta,
    ).toBeNull();
    const disse = pessoa({
      saidas: [
        { texto: "Carta 2: A Roda", em: new Date(AGORA.getTime() - 3 * DIA) },
        { texto: "Quer fazer uma pergunta nova?", em: new Date(AGORA.getTime() - DIA) },
      ],
    });
    expect(escolherOferta(disse, cfg, AGORA).oferta).toBeNull();
    // passados os 5 dias, volta a caber
    expect(
      escolherOferta(pessoa({ ofertasFeitas: [{ id: "pergunta_nova", em: new Date(AGORA.getTime() - 6 * DIA) }] }), cfg, AGORA).oferta?.id,
    ).toBe("pergunta_nova");
  });

  it.each([
    "isso é golpe",
    "estou sem dinheiro nem pra comida",
    "não me manda mais nada",
    "às vezes penso em suicídio",
    "PARE",
  ])("quem disse %j não recebe oferta nenhuma", (fala) => {
    expect(escolherOferta(pessoa({ comprou: true, falas: [fala, "meu marido sumiu"] }), cfg, AGORA)).toEqual({
      oferta: null,
      porque: "recusou_ou_fragil",
    });
  });

  it("a lista da organização soma à padrão", () => {
    const comLista = { ...cfg, nao_oferecer_se_cliente_disse: "sou evangélic" };
    expect(escolherOferta(pessoa({ falas: ["sou evangélica"] }), comLista, AGORA).oferta).toBeNull();
  });
});

describe("config", () => {
  it("desligada, ausente ou inválida = null", () => {
    expect(lerOfertaProativa({})).toBeNull();
    expect(lerOfertaProativa({ oferta_proativa: { ...cfg, enabled: false } })).toBeNull();
    expect(lerOfertaProativa({ oferta_proativa: { enabled: true, ofertas: [] } })).toBeNull();
    expect(lerOfertaProativa({ oferta_proativa: cfg })?.espaco_segundos).toBe(120);
  });

  it("recusa regex inválida, id repetido e faixa invertida", () => {
    const o = cfg.ofertas[1]!;
    expect(ofertaProativaSchema.safeParse({ ...cfg, ofertas: [{ ...o, cliente_disse: "(" }] }).success).toBe(false);
    expect(ofertaProativaSchema.safeParse({ ...cfg, ofertas: [o, o] }).success).toBe(false);
    expect(ofertaProativaSchema.safeParse({ ...cfg, hora_inicio: 20, hora_fim: 8 }).success).toBe(false);
  });
});

describe("ritmo e faixa", () => {
  it("espaço entre ofertas e teto do dia", () => {
    expect(ritmoPermite(cfg, { ultima_em: null, hoje: 0 }, AGORA)).toBe(true);
    expect(ritmoPermite(cfg, { ultima_em: new Date(AGORA.getTime() - 60_000).toISOString(), hoje: 3 }, AGORA)).toBe(false);
    expect(ritmoPermite(cfg, { ultima_em: new Date(AGORA.getTime() - 121_000).toISOString(), hoje: 3 }, AGORA)).toBe(true);
    expect(ritmoPermite(cfg, { ultima_em: null, hoje: 60 }, AGORA)).toBe(false);
  });

  it("faixa no fuso da organização", () => {
    expect(dentroDaFaixa(cfg, AGORA, "America/Porto_Velho")).toBe(true); // 09h
    expect(dentroDaFaixa(cfg, new Date("2026-10-21T03:00:00Z"), "America/Porto_Velho")).toBe(false); // 23h
  });

  it("o motivo leva a salvaguarda que a configuração não tira", () => {
    expect(motivoDaOferta(cfg.ofertas[1]!)).toMatch(/não envie nada/);
  });
});

describe("crise escrita abreviada fica fora da oferta", () => {
  it("reconhece a frase real de 21/10", async () => {
    const { NAO_OFERECER_PADRAO } = await import("./config");
    const r = new RegExp(NAO_OFERECER_PADRAO, "i");
    expect(r.test("Ate minha vd ja pensei em tirar")).toBe(true);
    expect(r.test("já pensei em me matar")).toBe(true);
    expect(r.test("quero fazer outra pergunta")).toBe(false);
  });
});

describe("condições de compra: quem comprou X, e há quanto tempo", () => {
  const compra = (produto: string, diasAtras: number) => ({ produto, em: new Date(AGORA.getTime() - diasAtras * DIA) });

  it("so_se_comprou exige uma compra do produto; quem comprou outra coisa ou nada fica de fora", () => {
    const o = { so_se_comprou: "pergunta" };
    expect(compraCabe(o, { produtosComprados: ["Pergunta nova"], compras: [compra("Pergunta nova", 1)] }, AGORA)).toBe(true);
    expect(compraCabe(o, { produtosComprados: ["Sinastria"], compras: [compra("Sinastria", 1)] }, AGORA)).toBe(false);
    expect(compraCabe(o, { produtosComprados: [] }, AGORA)).toBe(false);
  });

  it("compra_ha_pelo_menos_dias olha a compra MAIS RECENTE: quem comprou de novo ontem espera", () => {
    const o = { compra_ha_pelo_menos_dias: 7 };
    expect(compraCabe(o, { produtosComprados: ["Trabalho"], compras: [compra("Trabalho", 8)] }, AGORA)).toBe(true);
    expect(compraCabe(o, { produtosComprados: ["Trabalho"], compras: [compra("Trabalho", 8), compra("Pergunta", 1)] }, AGORA)).toBe(false);
    expect(compraCabe(o, { produtosComprados: [] }, AGORA)).toBe(false); // sem compra datada não cabe
  });

  it("as duas juntas: a data vale só para as compras do produto pedido", () => {
    const o = { so_se_comprou: "trabalho", compra_ha_pelo_menos_dias: 7 };
    const p = { produtosComprados: ["Trabalho", "Pergunta"], compras: [compra("Trabalho", 9), compra("Pergunta", 1)] };
    expect(compraCabe(o, p, AGORA)).toBe(true);
  });

  it("sem nenhuma das duas condições, a oferta cabe como antes", () => {
    expect(compraCabe({}, { produtosComprados: [] }, AGORA)).toBe(true);
  });

  it("escolherOferta respeita as condições: o trabalho só vai a quem comprou a pergunta e ainda não tem o trabalho", () => {
    const c = ofertaProativaSchema.parse({
      enabled: true,
      ofertas: [
        {
          id: "trabalho_apos_pergunta",
          motivo: "ofereça o trabalho a quem comprou a pergunta e recebeu a resposta",
          so_se_comprou: "pergunta",
          ja_tem_se_comprou: "trabalho",
        },
      ],
    });
    const comprouPergunta = pessoa({ comprou: true, produtosComprados: ["Pergunta nova"], compras: [compra("Pergunta nova", 1)] });
    expect(escolherOferta(comprouPergunta, c, AGORA)).toMatchObject({ oferta: { id: "trabalho_apos_pergunta" } });
    const jaTemTrabalho = pessoa({
      comprou: true,
      produtosComprados: ["Pergunta nova", "Trabalho"],
      compras: [compra("Pergunta nova", 3), compra("Trabalho", 1)],
    });
    expect(escolherOferta(jaTemTrabalho, c, AGORA)).toMatchObject({ oferta: null });
    expect(escolherOferta(pessoa(), c, AGORA)).toMatchObject({ oferta: null });
  });

  it("o schema recusa dias fora da faixa e regex inválida", () => {
    const base = { id: "x", motivo: "um motivo comprido o bastante para valer" };
    expect(() => ofertaProativaSchema.parse({ enabled: true, ofertas: [{ ...base, compra_ha_pelo_menos_dias: 0 }] })).toThrow();
    expect(() => ofertaProativaSchema.parse({ enabled: true, ofertas: [{ ...base, so_se_comprou: "(" }] })).toThrow();
  });
});
