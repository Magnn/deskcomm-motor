import { describe, expect, it } from "vitest";

import { conferirComprovante, entradasCombinadas } from "../pagamentos/comprovante-pix";
import { blocoDePreco } from "./bloco-do-prompt";
import { entradaImediata, reclamacoesDeValor, valorQueAPessoaTem } from "./estado-da-negociacao";
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
  it("abaixo da entrada mínima não fecha, e sem a pergunta o menor valor continua sendo segurado", () => {
    expect(entradaImediata(PRICING, [PRECO, PERGUNTA, m("inbound", "só tenho 5 reais")])).toBeNull();
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "só tenho 20")])).toBeNull();
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
