import { describe, expect, it } from "vitest";

import { horaNoFuso, medianaAtePrevia } from "./ao-vivo-dos-quizzes";
import { funilDoQuiz, maiorPerda, ordemDoPasso, passoDoQuizSchema, regiaoPeloFuso } from "./passos-do-quiz";

describe("funil dos quizzes da página", () => {
  it("o funil conta pessoas por passo, com a fração do total e do passo anterior", () => {
    const f = funilDoQuiz("caminhos", { abriu: 100, perguntas: 60, dados: 50, email: 40, previa: 40, pagar: 10, cobranca: 8, pago: 2, leitura: 2 });
    expect(f.map((l) => l.passo)).toEqual(["abriu", "perguntas", "dados", "email", "previa", "pagar", "cobranca", "pago", "leitura"]);
    expect(f[1]).toMatchObject({ pessoas: 60, doTotal: 0.6, doAnterior: 0.6 });
    expect(f[0]!.doAnterior).toBeNull();
    expect(maiorPerda(f)).toEqual({ de: "abriu", para: "perguntas", perdidos: 40 });
  });

  it("os três quizzes têm perguntas, antes dos dados", () => {
    expect(funilDoQuiz("prosperidade", { abriu: 3 }).map((l) => l.passo).slice(0, 3)).toEqual(["abriu", "perguntas", "dados"]);
  });

  it("sem ninguém, o funil é de zeros e não há maior perda", () => {
    const f = funilDoQuiz("sinastria", {});
    expect(f.every((l) => l.pessoas === 0 && l.doTotal === 0)).toBe(true);
    expect(maiorPerda(f)).toBeNull();
  });

  it("a ordem dos passos só avança: pagar vem depois da prévia", () => {
    expect(ordemDoPasso("abriu")).toBe(0);
    expect(ordemDoPasso("pagar")).toBeGreaterThan(ordemDoPasso("previa"));
  });

  it("o sinal sem passo é válido (o ao vivo), e a visita precisa ser UUID", () => {
    expect(passoDoQuizSchema.safeParse({ visita: "11111111-1111-4111-8111-111111111111", quiz: "caminhos" }).success).toBe(true);
    expect(passoDoQuizSchema.safeParse({ visita: "abc", quiz: "caminhos", passo: "abriu" }).success).toBe(false);
    expect(passoDoQuizSchema.safeParse({ visita: "11111111-1111-4111-8111-111111111111", quiz: "outro" }).success).toBe(false);
  });

  it("a região vem do fuso: estado quando o fuso é de um estado só, região quando cobre vários", () => {
    expect(regiaoPeloFuso("America/Porto_Velho")).toBe("RO");
    expect(regiaoPeloFuso("America/Manaus")).toBe("AM");
    expect(regiaoPeloFuso("America/Sao_Paulo")).toBe("Sudeste/Sul/GO/DF");
    expect(regiaoPeloFuso("Europe/Lisbon")).toBe("Portugal");
    expect(regiaoPeloFuso("America/New_York")).toBe("Estados Unidos");
    expect(regiaoPeloFuso("Asia/Seoul")).toBe("Asia · Seoul");
    expect(regiaoPeloFuso("")).toBeNull();
  });

  it("a hora é a do fuso da organização", () => {
    expect(horaNoFuso("2026-10-22T15:00:00Z", "America/Porto_Velho")).toBe(11);
    expect(horaNoFuso("2026-10-22T03:30:00Z", "America/Sao_Paulo")).toBe(0);
  });

  it("o tempo até a prévia é a mediana na MESMA visita, sem o que passa de 3 h", () => {
    const abriu = [
      { visita: "a", quiz: "caminhos", created_at: "2026-10-22T10:00:00Z" },
      { visita: "b", quiz: "caminhos", created_at: "2026-10-22T10:00:00Z" },
      { visita: "c", quiz: "caminhos", created_at: "2026-10-22T10:00:00Z" },
    ];
    const previa = [
      { visita: "a", quiz: "caminhos", created_at: "2026-10-22T10:01:00Z" },
      { visita: "b", quiz: "caminhos", created_at: "2026-10-22T10:03:00Z" },
      { visita: "c", quiz: "caminhos", created_at: "2026-10-22T20:00:00Z" },
      { visita: "z", quiz: "caminhos", created_at: "2026-10-22T10:02:00Z" },
    ];
    expect(medianaAtePrevia(abriu, previa)).toBe(3);
    expect(medianaAtePrevia([], [])).toBeNull();
  });
});
