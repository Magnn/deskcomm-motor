import { describe, expect, it } from "vitest";

import { numeroDoDestino, pedidoDeQuizSchema, perfilDosCaminhos, previaDoQuiz, tipoDoExtra } from "./quizzes";

describe("quizzes de uma pessoa", () => {
  it("número do destino: soma dos algarismos, guardando 11 e 22", () => {
    expect(numeroDoDestino("1984-02-07")).toBe(4); // 1+9+8+4+0+2+0+7 = 31 → 4
    expect(numeroDoDestino("1990-05-01")).toBe(7); // 1+9+9+0+0+5+0+1 = 25 → 7
    expect(numeroDoDestino("1992-09-29")).toBe(5); // 41 → 5
    expect(numeroDoDestino("1974-09-11")).toBe(5); // 32 → 5
    expect(numeroDoDestino("1983-11-24")).toBe(11); // 29 → 11
  });

  it("perfil dos caminhos pela maioria, e a última resposta desempata", () => {
    expect(perfilDosCaminhos({ area: "Amor", sente: "Querendo deixar o passado para trás", precisa: "Força para agir" })).toBe("recomeco");
    expect(perfilDosCaminhos({ area: "Amor", sente: "Cansada de tentar", precisa: "Força para agir" })).toBe("coragem");
    expect(perfilDosCaminhos({})).toBe("clareza");
  });

  it("prévia, extra e pedido", () => {
    expect(previaDoQuiz("prosperidade", { nascimento: "1984-02-07", respostas: {} })?.detalhe).toBe("Número 4");
    expect(previaDoQuiz("prosperidade", { respostas: {} })).toBeNull();
    expect(tipoDoExtra("quiz-caminhos")).toBe("caminhos");
    expect(tipoDoExtra("sinastria-quiz")).toBeNull();
    expect(pedidoDeQuizSchema.safeParse({ nome: "Ana", email: "a@b.com", forma: "pix" }).success).toBe(true);
  });
});
