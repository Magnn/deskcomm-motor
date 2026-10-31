import { describe, expect, it } from "vitest";

import { ofertaAindaDesce, ofertaFoiDita, precoPermitidoAgora, reclamacoesComOfertaPorSilencio } from "@/lib/preco/estado-da-negociacao";

import { lerRecuperacao, ofertaDoPasso, recuperacaoSchema } from "./config";
import { motivoDoPasso } from "./decisao";
import { disseQueNaoTemPrevisao } from "./pausa-anunciada";

const ESCADA = { list_price_cents: 13000, steps: [{ price_cents: 10000 }, { price_cents: 6000 }, { price_cents: 5000 }] } as never;
const recovery = { enabled: true, steps_minutes: [3, 15, 180, 360], keep_window: { enabled: false, hours_before_close: 3 }, step_offers_cents: [null, null, 10000, 6000] };

describe("o valor cai por silêncio", () => {
  it("⭐ a régua pedida: 3 h sem resposta oferece R$ 100, mais 3 h oferece R$ 60; os toques curtos não oferecem nada", () => {
    const r = lerRecuperacao({ recovery });
    expect(ofertaDoPasso(r, 1)).toBeNull();
    expect(ofertaDoPasso(r, 2)).toBeNull();
    expect(ofertaDoPasso(r, 3)).toBe(10000);
    expect(ofertaDoPasso(r, 4)).toBe(6000);
    expect(ofertaDoPasso(lerRecuperacao({ recovery: { ...recovery, step_offers_cents: undefined } }), 3)).toBeNull();
  });

  it("⭐ o lembrete com valor diz o valor, pede o sim e não manda cobrança nem convida a parar", () => {
    const motivo = motivoDoPasso(3, 4, 3 * 3_600_000, 10000);
    expect(motivo).toContain("R$ 100");
    expect(motivo).toContain("quer que você mande o Pix");
    expect(motivo).toContain("NÃO envie link nem código");
    expect(motivo).not.toContain("prefere parar");
    // Sem valor, o lembrete é o de sempre.
    expect(motivoDoPasso(3, 4, 3 * 3_600_000)).toContain("Retome de onde a conversa parou");
  });

  it("⭐ quem responde ao lembrete é cobrado pelo valor que ele ofereceu, sem precisar reclamar", () => {
    // Sem reclamação nenhuma, o valor permitido seria o cheio.
    expect(precoPermitidoAgora(ESCADA, 0)).toBe(13000);
    expect(precoPermitidoAgora(ESCADA, reclamacoesComOfertaPorSilencio(ESCADA, 0, 10000))).toBe(10000);
    expect(precoPermitidoAgora(ESCADA, reclamacoesComOfertaPorSilencio(ESCADA, null, 6000))).toBe(6000);
    // A negociação que já tinha descido mais não sobe de volta.
    expect(precoPermitidoAgora(ESCADA, reclamacoesComOfertaPorSilencio(ESCADA, 4, 10000))).toBe(5000);
    // Sem oferta, ou com um valor que não é degrau, nada muda.
    expect(reclamacoesComOfertaPorSilencio(ESCADA, 1, null)).toBe(1);
    expect(reclamacoesComOfertaPorSilencio(ESCADA, 1, 7700)).toBe(1);
  });

  it("mais valores do que passos é configuração inválida", () => {
    expect(recuperacaoSchema.safeParse({ ...recovery, steps_minutes: [3, 15], step_offers_cents: [null, null, 10000] }).success).toBe(false);
    expect(recuperacaoSchema.safeParse(recovery).success).toBe(true);
  });
});

describe("o lembrete nunca sobe o valor", () => {
  it("⭐ o caso de 31/10: quem ouviu R$ 60 não recebe 'consegui deixar por R$ 100'", () => {
    expect(ofertaAindaDesce(ESCADA, 10000, ["Por R$ 60, uma vez só."])).toBe(false);
    expect(ofertaAindaDesce(ESCADA, 10000, ["Consegui deixar por R$ 100."])).toBe(false);
  });

  it("quem só ouviu o valor cheio recebe, e valor fora da escada não conta", () => {
    expect(ofertaAindaDesce(ESCADA, 10000, ["De R$ 380 por R$ 130. Pergunta por R$ 5, ou 12x de R$ 15."])).toBe(true);
    expect(ofertaAindaDesce(ESCADA, 6000, ["Consegui deixar por R$ 100."])).toBe(true);
  });

  it("passo que saiu sem oferta não libera valor que ninguém disse", () => {
    const fala = (body: string) => ({ direction: "outbound", body });
    expect(ofertaFoiDita(10000, [fala("Consegui deixar por R$ 100.")])).toBe(true);
    expect(ofertaFoiDita(10000, [fala("O seu trabalho é R$ 130.")])).toBe(false);
    expect(ofertaFoiDita(10000, [{ direction: "inbound", body: "só tenho R$ 100" }])).toBe(false);
  });

  it("⭐ 'nem sei quando vou ter' tira a oferta; 'não tenho' sozinho não", () => {
    expect(disseQueNaoTemPrevisao("Minha linda não tenho dinhero agora nem sei quando vou ter")).toBe(true);
    expect(disseQueNaoTemPrevisao("Eu não tenho se eu tivesse era minha vontade")).toBe(false);
    expect(disseQueNaoTemPrevisao(null)).toBe(false);
  });
});
