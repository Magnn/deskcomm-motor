import { describe, expect, it } from "vitest";

import { conferirComprovante, entradasCombinadas } from "../pagamentos/comprovante-pix";
import { blocoDePreco } from "./bloco-do-prompt";
import { entradaImediata, reclamacoesDeValor, valorAbaixoDoPisoAgora, valorQueAPessoaTem } from "./estado-da-negociacao";
import { blocoDaOportunidade, ofertaAtivaDaConversa, ofertaEmConflito, oportunidadeDeOferta } from "./oferta-ativa";
import { pricingSchema } from "./tipos";

const degrau = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({ enabled: true, list_price_cents: 13000, min_down_payment_cents: 1000, steps: [degrau(10000), degrau(6000), degrau(5000)] });
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });
const PRECO = m("outbound", "O trabalho é R$ 130.");
const PERGUNTA = m("outbound", "Entendo, Lorena. Você não precisa pagar tudo hoje. Quanto você consegue hoje? O restante a gente acerta depois.");

describe("quanto ela pode hoje", () => {
  it("⭐ Lorena e o caso de 31/10: dizer que está alto é reclamar do valor", () => {
    for (const fala of ["Valor está alto", "Não o valor é muito alto pra mim", "tá muito alto", "o preço tá puxado"]) {
      expect(reclamacoesDeValor([PRECO, m("inbound", fala)])).toBe(1);
    }
    expect(reclamacoesDeValor([PRECO, m("inbound", "passou com som bem alto")])).toBe(0);
  });
  it("a primeira reclamação pergunta quanto ela pode hoje, sem cartão e sem desconto", () => {
    const bloco = blocoDePreco(PRICING, { reclamacoes: 1, reclamouAgora: true });
    expect(bloco).toContain("Quanto você consegue hoje?");
    expect(bloco).toContain("O restante a gente acerta depois");
    expect(bloco).not.toContain("parcelamento no cartão, Pix pelo link");
  });
  it("sem entrada configurada, segue a defesa do valor", () => {
    const { min_down_payment_cents: _, ...semEntrada } = PRICING;
    expect(blocoDePreco(semEntrada, { reclamacoes: 1, reclamouAgora: true })).toContain("parcelamento no cartão, Pix pelo link");
  });
  it("a resposta vira a entrada na hora, mesmo abaixo do menor valor", () => {
    for (const [fala, cents] of [["30", 3000], ["uns 40", 4000], ["80 hoje", 8000], ["consigo 20", 2000]] as const) {
      expect(entradaImediata(PRICING, [PRECO, m("inbound", "Valor está alto"), PERGUNTA, m("inbound", fala)])).toEqual({ entradaCents: cents, restanteCents: 13000 - cents });
    }
  });
  it("a pergunta em balões separados também conta", () => {
    const conversa = [PRECO, m("outbound", "Quanto você consegue hoje?"), m("outbound", "O restante a gente acerta depois."), m("inbound", "30")];
    expect(valorQueAPessoaTem(conversa)).toBe(3000);
    expect(entradaImediata(PRICING, conversa)).toEqual({ entradaCents: 3000, restanteCents: 10000 });
  });
  it("⭐ Marli: 'Pago 30 Hj' fecha a entrada, sem pedir para completar", () => {
    const conversa = [PRECO, m("inbound", "Pago 30 Hj")];
    expect(entradaImediata(PRICING, conversa)).toEqual({ entradaCents: 3000, restanteCents: 10000 });
    expect(valorAbaixoDoPisoAgora(PRICING, conversa)).toBeNull();
  });
  it("abaixo da entrada mínima não fecha, e o que se segura é a entrada mínima", () => {
    const conversa = [PRECO, PERGUNTA, m("inbound", "só tenho 5 reais")];
    expect(entradaImediata(PRICING, conversa)).toBeNull();
  });
  it("sem entrada configurada, o menor valor continua sendo segurado", () => {
    const { min_down_payment_cents: _, ...semEntrada } = PRICING;
    expect(entradaImediata(semEntrada, [PRECO, m("inbound", "só tenho 20")])).toBeNull();
    expect(valorAbaixoDoPisoAgora(semEntrada, [PRECO, m("inbound", "só tenho 20")])).toEqual({ ditoCents: 2000, pisoCents: 5000 });
  });
  it("com a entrada de pé, nenhum valor mais alto volta, e falar do restante passa", () => {
    const extras = [{ name: "Pergunta nova", when: "x", delivery: "x", price_cents: 700 }] as never;
    const entrada = m("outbound", "Fechado: você entra com R$ 30 agora e o restante de R$ 100 a gente acerta depois.");
    expect(ofertaAtivaDaConversa(PRICING, extras, [entrada])).toEqual({ tipo: "pequena", nome: "Entrada de hoje", cents: 3000 });
    const conferir = (corpo: string) => ofertaEmConflito(PRICING, extras, { corpo, baloesDoTurno: [], mensagens: [entrada, m("inbound", "ok")], liberado: false });
    expect(conferir("Consigo fazer por R$ 60 pra você.")).toContain("Entrada de hoje");
    expect(conferir("O restante de R$ 100 a gente acerta no dia que for bom.")).toBeNull();
  });
});

describe("o comprovante da entrada", () => {
  const CHAVE = { key: "+5569993677810", holder: "Matheus Lobato Bocalon", primary: true } as never;
  const AGORA = new Date("2026-11-01T15:30:00.000Z");
  const texto = "Comprovante de Pix. 01/11/2026 às 12:10. Valor R$ 30,00. Para Matheus Lobato Bocalon. ID da transação E12345678202611011510abcDEF12345";
  const cobrancas = [{ valorCents: 3000, quantidade: 1, nome: null, enviadaEm: new Date("2026-11-01T15:00:00.000Z") }];

  it("⭐ a entrada fechada na conversa confere, sem ir para a equipe", () => {
    const entradas = entradasCombinadas([{ ...m("outbound", "Fechado, Lorena: você entra com R$ 30 agora e o restante de R$ 100 a gente acerta depois."), sent_at: "2026-11-01T15:00:00.000Z" }]);
    expect(entradas).toEqual([3000]);
    expect(conferirComprovante({ texto, chave: CHAVE, cobrancas, extras: [], valoresDoPrincipal: [13000], entradas, agora: AGORA }).tipo).toBe("confere_principal");
  });
  it("sem entrada combinada, o valor solto segue para a equipe", () => {
    expect(conferirComprovante({ texto, chave: CHAVE, cobrancas, extras: [], valoresDoPrincipal: [13000], entradas: [], agora: AGORA }).tipo).toBe("nao_confere");
  });
});

describe("a porta aberta", () => {
  const pergunta = { name: "Pergunta nova", when: "x", delivery: "x", price_cents: 700 };
  const recado = { name: "Recado do Coração", when: "x", delivery: "x", price_cents: 1500 };
  const extras = [recado, pergunta] as never;
  const conversa = (fala: string, ...antes: ReturnType<typeof m>[]) => [
    PRECO,
    ...antes,
    m("outbound", "Fica aqui comigo."),
    m("outbound", "Te escuto."),
    m("outbound", "Sei como é."),
    m("outbound", "Conta mais."),
    m("inbound", fala),
  ];

  it("⭐ pergunta sobre a pessoa ou novidade abre a oferta menor", () => {
    expect(oportunidadeDeOferta(PRICING, extras, conversa("será que ele ainda me ama?"))?.name).toBe("Pergunta nova");
    expect(oportunidadeDeOferta(PRICING, extras, conversa("ele me respondeu agora"))?.name).toBe("Pergunta nova");
  });
  it("sem preço dito, com oferta recente, ou em assunto de pagamento e trabalho, não abre", () => {
    expect(oportunidadeDeOferta(PRICING, extras, [m("outbound", "Oi."), m("inbound", "ele vai voltar?")])).toBeNull();
    expect(oportunidadeDeOferta(PRICING, extras, [PRECO, m("inbound", "ele vai voltar?")])).toBeNull();
    expect(oportunidadeDeOferta(PRICING, extras, conversa("fazendo isso ele vai voltar?"))).toBeNull();
    expect(oportunidadeDeOferta(PRICING, extras, conversa("vou pagar, ele me ligou"))).toBeNull();
    expect(oportunidadeDeOferta(PRICING, extras, conversa("oi, tudo bem"))).toBeNull();
  });
  it("não atropela a pergunta que ela já comprou", () => {
    const pedindo = [PRECO, m("outbound", "A."), m("outbound", "B."), m("outbound", "C."), m("outbound", "Qual é a sua pergunta?"), m("inbound", "o que ele pensa de mim")];
    expect(oportunidadeDeOferta(PRICING, extras, pedindo)).toBeNull();
  });
  it("a oferta da porta passa pela trava, antes do menor valor", () => {
    const mensagens = conversa("ele me respondeu agora");
    expect(ofertaEmConflito(PRICING, extras, { corpo: "Eu abro a mesa por R$ 7, uma *Pergunta nova*.", baloesDoTurno: [], mensagens, liberado: false })).toBeNull();
  });
  it("o bloco pede desejo antes da oferta", () => {
    const bloco = blocoDaOportunidade(pergunta as never);
    expect(bloco.indexOf("Gere desejo")).toBeLessThan(bloco.indexOf("Ofereça só *Pergunta nova*"));
    expect(blocoDaOportunidade(null)).toBe("");
  });
});
