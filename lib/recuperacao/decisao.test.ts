import { describe, expect, it } from "vitest";

import { RECUPERACAO_PADRAO, lerRecuperacao, recuperacaoSchema } from "./config";
import { decidirManterJanela, decidirPasso } from "./decisao";

const T0 = new Date("2026-10-06T12:00:00Z");
const em = (min: number) => new Date(T0.getTime() + min * 60_000);
const r = RECUPERACAO_PADRAO;
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
