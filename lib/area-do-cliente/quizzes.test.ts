import { describe, expect, it } from "vitest";

import { PERGUNTAS_DOS_CAMINHOS, anoPessoal, contaDoDestino, numeroDoDestino, pedidoDeQuizSchema, perfilDosCaminhos, previaDoQuiz, tipoDoExtra, votosDosCaminhos } from "./quizzes";

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

  it("a conta do destino que a tela mostra é a mesma que dá o número", () => {
    expect(contaDoDestino("1984-02-07")).toEqual({ passos: ["1+9+8+4+0+2+0+7 = 31", "3+1 = 4"], numero: 4 });
    expect(contaDoDestino("1983-11-24")).toEqual({ passos: ["1+9+8+3+1+1+2+4 = 29", "2+9 = 11"], numero: 11 });
    expect(contaDoDestino("x")).toBeNull();
  });

  it("ano pessoal: dia + mês + ano, reduzidos a 1–9", () => {
    expect(anoPessoal("1984-02-07", 2027)).toBe(2); // 0+7+0+2+2+0+2+7 = 20 → 2
    expect(anoPessoal("1990-05-15", 2027)).toBe(4); // 1+5+0+5+2+0+2+7 = 22 → 4
  });

  it("a prévia leva o fato calculado que a leitura completa precisa entregar", () => {
    const outubro = new Date(2026, 9, 22);
    expect(previaDoQuiz("prosperidade", { nascimento: "1984-02-07", respostas: {} }, outubro)?.fato).toMatch(/^Ano pessoal de 2027: 2 /);
    expect(previaDoQuiz("caminhos", { respostas: { area: "Amor", sente: "Querendo deixar o passado para trás" } })?.fato).toMatch(/^Carta-chave: A Estrela\./);
  });

  it("caminhos: cada resposta conta um voto, e a tela mostra os mesmos votos que decidiram", () => {
    const r = Object.fromEntries(PERGUNTAS_DOS_CAMINHOS.map((p) => [p.id, p.opcoes[1][0]]));
    const votos = votosDosCaminhos(r);
    expect(votos).toHaveLength(PERGUNTAS_DOS_CAMINHOS.length);
    const perfil = perfilDosCaminhos(r);
    const maior = Math.max(...["recomeco", "clareza", "coragem", "paz"].map((k) => votos.filter((v) => v.perfil === k).length));
    expect(votos.filter((v) => v.perfil === perfil).length).toBe(maior);
  });
});
