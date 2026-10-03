/**
 * O calendário das campanhas: em que dia cada uma mora, e a grade do mês.
 */
import { describe, expect, it } from "vitest";

import { campanhasPorDia, chaveDoDia, diaDaCampanha, gradeDoMes } from "./calendario";

// Datas montadas no fuso LOCAL de quem roda o teste: a regra é "o dia de quem
// olha", e um ISO fixo em UTC cairia em dias diferentes conforme a máquina.
const local = (ano: number, mes: number, dia: number, hora = 12) => new Date(ano, mes, dia, hora).toISOString();

const campanha = (id: string, over: { scheduled_at?: string | null; started_at?: string | null } = {}) => ({
  id,
  name: id,
  status: "draft",
  scheduled_at: null,
  started_at: null,
  ...over,
});

describe("diaDaCampanha", () => {
  it("rascunho sem agenda não tem dia — pô-lo na data de criação diria que houve envio", () => {
    expect(diaDaCampanha(campanha("a"))).toBeNull();
  });

  it("agendada mora no dia agendado; iniciada, no dia em que começou — o que aconteceu vence o planejado", () => {
    const agendada = campanha("a", { scheduled_at: local(2026, 9, 20) });
    expect(chaveDoDia(diaDaCampanha(agendada)!)).toBe("2026-10-20");
    const adiantada = campanha("b", { scheduled_at: local(2026, 9, 20), started_at: local(2026, 9, 19) });
    expect(chaveDoDia(diaDaCampanha(adiantada)!)).toBe("2026-10-19");
  });

  it("data ilegível não vira dia", () => {
    expect(diaDaCampanha(campanha("a", { scheduled_at: "ontem" }))).toBeNull();
  });
});

describe("campanhasPorDia", () => {
  it("agrupa pelo dia LOCAL: 23h continua no mesmo dia, e quem não tem dia fica de fora", () => {
    const mapa = campanhasPorDia([
      campanha("manha", { scheduled_at: local(2026, 9, 20, 8) }),
      campanha("noite", { scheduled_at: local(2026, 9, 20, 23) }),
      campanha("outra", { started_at: local(2026, 9, 21, 0) }),
      campanha("rascunho"),
    ]);
    expect(mapa.get("2026-10-20")?.map((c) => c.id)).toEqual(["manha", "noite"]);
    expect(mapa.get("2026-10-21")?.map((c) => c.id)).toEqual(["outra"]);
    expect([...mapa.values()].flat()).toHaveLength(3);
  });
});

describe("gradeDoMes", () => {
  it("cobre o mês em semanas inteiras, de domingo a sábado", () => {
    // Outubro de 2026 começa numa quinta e termina num sábado.
    const dias = gradeDoMes(2026, 9);
    expect(dias).toHaveLength(35);
    expect(dias[0]).toMatchObject({ chave: "2026-09-27", doMes: false });
    expect(dias[0]!.data.getDay()).toBe(0);
    expect(dias.at(-1)).toMatchObject({ chave: "2026-10-31", doMes: true });
    expect(dias.filter((d) => d.doMes)).toHaveLength(31);
  });

  it("mês que começa no domingo não ganha semana vazia antes; fevereiro de 28 dias cabe em 4 semanas", () => {
    // Fevereiro de 2026: 1º é domingo, 28 é sábado.
    const dias = gradeDoMes(2026, 1);
    expect(dias).toHaveLength(28);
    expect(dias.every((d) => d.doMes)).toBe(true);
  });

  it("vira o ano sem perder nem repetir dia: dezembro traz o começo de janeiro", () => {
    const dias = gradeDoMes(2026, 11);
    expect(dias.at(-1)!.chave).toBe("2027-01-02");
    expect(new Set(dias.map((d) => d.chave)).size).toBe(dias.length);
  });
});
