import { describe, expect, it } from "vitest";

import { RECUPERACAO_PADRAO, lerRecuperacao, recuperacaoSchema } from "./config";
import { decidirManterJanela, decidirPasso, motivoDoPasso } from "./decisao";

const T0 = new Date("2026-10-06T12:00:00Z");
const em = (min: number) => new Date(T0.getTime() + min * 60_000);
// Três passos de propósito: as regras de ordem e de atraso só aparecem com mais de dois.
const r = { ...RECUPERACAO_PADRAO, steps_minutes: [3, 15, 180] };
const sempreAberta = () => null;

describe("lerRecuperacao", () => {
  it("desligada, ausente ou inválida = ninguém é chamado", () => {
    expect(lerRecuperacao({ recovery: r })).toEqual(r);
    expect(lerRecuperacao({ recovery: { ...r, enabled: false } })).toBeNull();
    expect(lerRecuperacao({ enabled: true })).toBeNull();
    expect(lerRecuperacao({ recovery: { enabled: true } })).toBeNull();
    expect(lerRecuperacao(null)).toBeNull();
  });

  it("passos têm de crescer e caber nas 24 horas", () => {
    expect(recuperacaoSchema.safeParse({ ...r, steps_minutes: [15, 3] }).success).toBe(false);
    expect(recuperacaoSchema.safeParse({ ...r, steps_minutes: [3, 3] }).success).toBe(false);
    expect(recuperacaoSchema.safeParse({ ...r, steps_minutes: [3, 24 * 60] }).success).toBe(false);
    expect(recuperacaoSchema.safeParse({ ...r, steps_minutes: [] }).success).toBe(false);
  });
});

describe("decidirPasso", () => {
  it("3 min, 15 min e 3 h de silêncio disparam a 1ª, a 2ª e a 3ª chamada — e depois nada", () => {
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 0, ultimaEm: null }, em(2))).toBeNull();
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 0, ultimaEm: null }, em(3))).toBe(1);
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 1, ultimaEm: em(3) }, em(14))).toBeNull();
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 1, ultimaEm: em(3) }, em(15))).toBe(2);
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 2, ultimaEm: em(15) }, em(179))).toBeNull();
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 2, ultimaEm: em(15) }, em(180))).toBe(3);
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 3, ultimaEm: em(180) }, em(600))).toBeNull();
  });

  it("com atraso, sai uma chamada por vez: a seguinte espera o intervalo previsto entre as duas", () => {
    // O worker voltou aos 20 min: os passos de 3 e de 15 venceram juntos.
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 0, ultimaEm: null }, em(20))).toBe(1);
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 1, ultimaEm: em(20) }, em(21))).toBeNull();
    expect(decidirPasso(r, { silencioDesde: T0, feitas: 1, ultimaEm: em(20) }, em(32))).toBe(2);
  });
});

describe("decidirManterJanela", () => {
  const fechaEm = em(24 * 60);
  const base = { fechaEm, retornoEm: em(3 * 24 * 60), jaEnviada: false };

  it("só nas últimas horas antes de o prazo fechar, uma vez, e com folga do fechamento", () => {
    expect(decidirManterJanela(r, base, em(20 * 60), sempreAberta)).toBe(false);
    expect(decidirManterJanela(r, base, em(21 * 60), sempreAberta)).toBe(true);
    expect(decidirManterJanela(r, { ...base, jaEnviada: true }, em(22 * 60), sempreAberta)).toBe(false);
    expect(decidirManterJanela(r, base, em(24 * 60 - 3), sempreAberta)).toBe(false);
  });

  it("retorno combinado para dentro do prazo não precisa de mensagem; interruptor desligado não manda", () => {
    expect(decidirManterJanela(r, { ...base, retornoEm: em(23 * 60) }, em(22 * 60), sempreAberta)).toBe(false);
    const desligada = { ...r, keep_window: { ...r.keep_window, enabled: false } };
    expect(decidirManterJanela(desligada, base, em(22 * 60), sempreAberta)).toBe(false);
  });

  it("fora da faixa de horário não manda; se a faixa fecha e não reabre antes do prazo, antecipa", () => {
    // Faixa fechada agora, abre só depois de o prazo vencer.
    expect(decidirManterJanela(r, base, em(22 * 60), () => em(30 * 60))).toBe(false);
    // Aberta agora (18 h de prazo corrido), fecha em minutos e só reabre depois do vencimento: antecipa.
    const fechando = (i: Date) => (i.getTime() > em(18 * 60).getTime() ? em(30 * 60) : null);
    expect(decidirManterJanela(r, base, em(18 * 60), fechando)).toBe(true);
    // Aberta agora e reabre a tempo: espera as últimas horas.
    const reabreATempo = (i: Date) => (i.getTime() > em(18 * 60).getTime() ? em(22 * 60) : null);
    expect(decidirManterJanela(r, base, em(18 * 60), reabreATempo)).toBe(false);
  });
});

describe("o que o agente lê ao ser acordado", () => {
  it("a régua padrão é espaçada: uma hora e vinte horas", () => {
    expect(RECUPERACAO_PADRAO.steps_minutes).toEqual([60, 1200]);
    expect(recuperacaoSchema.safeParse(RECUPERACAO_PADRAO).success).toBe(true);
  });

  it("⭐ só a ÚLTIMA chamada de um silêncio longo convida a sair, com a palavra que o descadastro reconhece", () => {
    const ultima = motivoDoPasso(2, 2, 3 * 60 * 60_000);
    expect(ultima).toContain("basta responder SAIR");
    expect(ultima).toContain("SALIR");
    expect(ultima).toContain("3 horas");
  });

  it("⭐ chamada do meio da conversa NÃO convida a sair — medido: 21 pessoas bloqueadas num dia respondendo o convite", () => {
    for (const motivo of [motivoDoPasso(1, 3, 3 * 60_000), motivoDoPasso(2, 3, 15 * 60_000), motivoDoPasso(1, 2, 60 * 60_000)]) {
      expect(motivo).not.toContain("basta responder SAIR");
      expect(motivo).toContain("NÃO ofereça descadastro");
    }
    // Última chamada, mas a pessoa falou há minutos (régua curta): ainda está na conversa.
    expect(motivoDoPasso(1, 1, 5 * 60_000)).not.toContain("basta responder SAIR");
  });
});
