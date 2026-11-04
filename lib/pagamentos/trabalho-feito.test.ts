import { describe, expect, it } from "vitest";

import { motivoDoTrabalhoFeito, podeAvisar } from "./trabalho-feito";

const AGORA = new Date("2026-11-04T20:00:00Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000);

describe("podeAvisar", () => {
  it("dentro da janela e sem aviso recente: pode", () => {
    expect(podeAvisar(AGORA, h(23), null)).toEqual({ ok: true });
    expect(podeAvisar(AGORA, h(1), h(7))).toEqual({ ok: true });
  });
  it("sem mensagem dela, ou há mais de 24 h: não pode (regra da janela do dono)", () => {
    expect(podeAvisar(AGORA, null, null)).toEqual({ ok: false, motivo: "sem_mensagem_dela" });
    expect(podeAvisar(AGORA, h(24.1), null)).toEqual({ ok: false, motivo: "fora_da_janela" });
  });
  it("aviso pedido há menos de 6 h barra mesmo dentro da janela", () => {
    expect(podeAvisar(AGORA, h(1), h(5))).toEqual({ ok: false, motivo: "ja_avisado" });
  });
});

describe("motivoDoTrabalhoFeito", () => {
  it("fala só do que a equipe confirmou: sem observação, não inventa uma", () => {
    const m = motivoDoTrabalhoFeito("");
    expect(m).toMatch(/ACABOU DE CONFIRMAR/);
    expect(m).not.toMatch(/O que a equipe pediu/);
    expect(m).toMatch(/Se não há foto, não fale de foto/);
    expect(m).toMatch(/sem criar etapa, ritual ou prazo novo/);
  });
  it("a observação entra entre aspas, para o agente repassar sem acrescentar", () => {
    expect(motivoDoTrabalhoFeito("  acendemos às 21h ")).toMatch(/"acendemos às 21h"/);
  });
});
