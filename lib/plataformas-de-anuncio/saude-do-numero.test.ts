import { describe, expect, it } from "vitest";

import {
  bloqueioDoNumero,
  codigoDaMeta,
  contarEpisodios,
  fatorDaNota,
  notaDeSaude,
  type EnvioRecente,
  type SinaisDeSaude,
} from "./saude-do-numero";

const limpo: SinaisDeSaude = { quedas72h: 0, enviadas24h: 0, falhas24h: 0, picoPorHora24h: 0, leads72h: 0, leadsSumidos72h: 0 };
const MIN = 60_000;

describe("contarEpisodios", () => {
  it("avisos a menos de 30 min um do outro são a mesma queda", () => {
    // 5230 em 17/11: 11:05, 11:07, 11:13 ×3 | 12:24, 12:29 ×3 | 17:01 → 3 quedas.
    const h = (hh: number, mm: number) => (hh * 60 + mm) * MIN;
    expect(contarEpisodios([h(11, 5), h(11, 7), h(11, 13), h(11, 13), h(11, 14), h(12, 24), h(12, 29), h(12, 29), h(17, 1)])).toBe(3);
  });
  it("sem aviso, zero; ordem não importa", () => {
    expect(contarEpisodios([])).toBe(0);
    expect(contarEpisodios([100 * MIN, 0, 40 * MIN])).toBe(3);
  });
});

describe("notaDeSaude", () => {
  it("número limpo vale 100", () => {
    expect(notaDeSaude(limpo)).toBe(100);
  });
  it("três quedas em 72 h derrubam para 25 (descansa)", () => {
    const nota = notaDeSaude({ ...limpo, quedas72h: 3 });
    expect(nota).toBe(25);
    expect(fatorDaNota(nota)).toBe(0);
  });
  it("uma queda só ainda recebe o orçamento inteiro", () => {
    expect(fatorDaNota(notaDeSaude({ ...limpo, quedas72h: 1 }))).toBe(1);
  });
  it("10% de falha de envio tira 30; amostra pequena não pune", () => {
    expect(notaDeSaude({ ...limpo, enviadas24h: 200, falhas24h: 20 })).toBe(70);
    expect(notaDeSaude({ ...limpo, enviadas24h: 10, falhas24h: 10 })).toBe(100);
  });
  it("pico de 100+/h tira 20", () => {
    expect(notaDeSaude({ ...limpo, picoPorHora24h: 160 })).toBe(80);
    expect(notaDeSaude({ ...limpo, picoPorHora24h: 99 })).toBe(100);
  });
  it("lead que some só pesa acima de 40% e com 10+ leads", () => {
    expect(notaDeSaude({ ...limpo, leads72h: 20, leadsSumidos72h: 8 })).toBe(100);
    expect(notaDeSaude({ ...limpo, leads72h: 20, leadsSumidos72h: 14 })).toBe(85);
    expect(notaDeSaude({ ...limpo, leads72h: 5, leadsSumidos72h: 5 })).toBe(100);
  });
  it("uma queda + pico alto = metade do orçamento", () => {
    const nota = notaDeSaude({ ...limpo, quedas72h: 1, picoPorHora24h: 223 });
    expect(nota).toBe(55);
    expect(fatorDaNota(nota)).toBe(0.5);
  });
  it("nunca sai de 0–100", () => {
    expect(notaDeSaude({ quedas72h: 9, enviadas24h: 100, falhas24h: 100, picoPorHora24h: 999, leads72h: 100, leadsSumidos72h: 100 })).toBe(0);
  });
});

describe("bloqueioDoNumero", () => {
  const e = (min: number, status: string, error_code: string | null = null, error_message: string | null = null): EnvioRecente => ({
    status,
    error_code,
    error_message,
    created_at: new Date(Date.UTC(2026, 10, 19, 12, min)).toISOString(),
  });
  const travada = "131031 — Business Account locked — Meta has restricted or disabled the WhatsApp Business Account";

  it("lê o código no error_code (Cloud API) ou no começo da mensagem (parceiro)", () => {
    expect(codigoDaMeta("130497", null)).toBe("130497");
    expect(codigoDaMeta("zernio_error", travada)).toBe("131031");
    expect(codigoDaMeta("waha_error", "waha_500")).toBeNull();
    expect(codigoDaMeta(null, null)).toBeNull();
  });

  it("recusa de bloqueio mais nova que o último envio que saiu = bloqueado", () => {
    expect(bloqueioDoNumero([e(0, "sent"), e(5, "failed", "zernio_error", travada)])).toBe("131031");
  });

  it("envio que saiu depois da recusa devolve o número ao rodízio", () => {
    expect(bloqueioDoNumero([e(0, "failed", "130497"), e(5, "delivered")])).toBeNull();
  });

  it("falha comum ou recusa por destinatário não bloqueia", () => {
    expect(bloqueioDoNumero([e(0, "failed", "131026"), e(1, "failed", "queue_expired", "Ficou mais de 24 horas")])).toBeNull();
    expect(bloqueioDoNumero([])).toBeNull();
  });
});
