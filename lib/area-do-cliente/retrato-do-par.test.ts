import { describe, expect, it } from "vitest";

import { PERGUNTAS_DO_PAR, previaDoPar, previaDoQuiz } from "./quizzes";
import { elementosConversam, instanteDoNascimento, longitudeDeVenus, longitudeDoAscendente, retratoDoPar, SIGNOS_DO_ZODIACO } from "./retrato-do-par";

const signoEGrau = (g: number) => ({ signo: SIGNOS_DO_ZODIACO[Math.floor(g / 30)], grau: g % 30 });

describe("Retrato do Par — o cálculo bate com mapas publicados", () => {
  it("Diana (01/07/1961 19:45 BST, Sandringham): Ascendente Sagitário ~18°, Vênus Touro ~24°", () => {
    const quando = new Date(Date.UTC(1961, 6, 1, 18, 45));
    const asc = signoEGrau(longitudeDoAscendente(quando, 52.83, 0.5));
    const venus = signoEGrau(longitudeDeVenus(quando));
    expect(asc.signo).toBe("Sagitário");
    expect(asc.grau).toBeGreaterThan(17.5);
    expect(asc.grau).toBeLessThan(19.5);
    expect(venus.signo).toBe("Touro");
    expect(Math.round(venus.grau)).toBe(24);
  });

  it("Obama (04/08/1961 19:24 HST, Honolulu): Ascendente Aquário ~18°, Vênus Câncer ~2°", () => {
    const quando = new Date(Date.UTC(1961, 7, 5, 5, 24));
    expect(signoEGrau(longitudeDoAscendente(quando, 21.31, -157.86)).signo).toBe("Aquário");
    const venus = signoEGrau(longitudeDeVenus(quando));
    expect(venus.signo).toBe("Câncer");
    expect(venus.grau).toBeLessThan(3);
  });

  it("a hora de nascimento respeita o horário de verão da época (São Paulo, jan/1995 = UTC−2)", () => {
    expect(instanteDoNascimento("1992-08-10", "14:30", "America/Sao_Paulo")?.toISOString()).toBe("1992-08-10T17:30:00.000Z");
    expect(instanteDoNascimento("1995-01-10", "14:30", "America/Sao_Paulo")?.toISOString()).toBe("1995-01-10T16:30:00.000Z");
  });
});

describe("Retrato do Par — o retrato", () => {
  it("com hora e lugar: Vênus, Descendente oposto ao Ascendente e os signos do elemento do Descendente", () => {
    const r = retratoDoPar({ nascimento: "1992-08-10", hora: "14:30", lugar: "SP" })!;
    expect(r.venus.signo).toBe("Virgem");
    expect(r.descendente?.signo).toBe("Câncer");
    expect(r.descendente?.ascendente).toBe("Capricórnio");
    expect(r.combinam).toEqual(["Câncer", "Escorpião", "Peixes"]);
    expect(r.encontro).toBe("conversam"); // terra + água
  });

  it("sem hora: só Vênus, e a prévia diz que o Descendente precisa da hora", () => {
    const r = retratoDoPar({ nascimento: "1992-08-10" })!;
    expect(r.descendente).toBeNull();
    expect(r.encontro).toBe("sem_hora");
    expect(previaDoPar("1992-08-10", {})?.fato).toContain("Descendente não calculado");
  });

  it("lugar desconhecido conta como sem hora (não inventa o Descendente)", () => {
    expect(retratoDoPar({ nascimento: "1992-08-10", hora: "14:30", lugar: "XX" })?.descendente).toBeNull();
  });

  it("os elementos que conversam: fogo-ar, terra-água e cada um consigo", () => {
    expect(elementosConversam("fogo", "ar")).toBe(true);
    expect(elementosConversam("água", "terra")).toBe(true);
    expect(elementosConversam("fogo", "fogo")).toBe(true);
    expect(elementosConversam("fogo", "água")).toBe(false);
  });

  it("a prévia do quiz leva o fato calculado para a leitura, e as opções cabem no limite do pedido", () => {
    const p = previaDoQuiz("par", { nascimento: "1992-08-10", respostas: { hora: "14:30", lugar: "SP" } });
    expect(p?.titulo).toBe("Vênus em Virgem, Descendente em Câncer");
    expect(p?.fato).toContain("signos do perfil que combina: Câncer, Escorpião, Peixes");
    expect(previaDoQuiz("par", { respostas: {} })).toBeNull();
    for (const q of PERGUNTAS_DO_PAR) for (const o of q.opcoes) expect(o.length).toBeLessThanOrEqual(80);
  });
});
