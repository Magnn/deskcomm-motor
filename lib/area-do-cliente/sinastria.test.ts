import { describe, expect, it } from "vitest";

import { PERGUNTAS_DO_QUIZ, ROTULO_DA_RESPOSTA, pedidoDoQuizSchema, previaDaSinastria, signoDe, tomDaCombinacao } from "./sinastria";

describe("sinastria do quiz", () => {
  it("calcula o signo solar pelas datas de corte", () => {
    expect(signoDe("1984-02-07")).toBe("Aquário");
    expect(signoDe("1997-12-13")).toBe("Sagitário");
    expect(signoDe("1990-12-25")).toBe("Capricórnio");
    expect(signoDe("1990-01-10")).toBe("Capricórnio");
    expect(signoDe("1990-03-21")).toBe("Áries");
    expect(signoDe("1990-03-20")).toBe("Peixes");
    expect(signoDe("1990-07-23")).toBe("Leão");
    expect(signoDe("x")).toBeNull();
  });

  it("a prévia junta signos, elementos e o tom, na mesma resposta para a ordem inversa", () => {
    const p = previaDaSinastria("1984-02-07", "1997-12-13");
    expect(p).toMatchObject({ signoDela: "Aquário", signoDele: "Sagitário", elementoDela: "ar", elementoDele: "fogo", titulo: "Vento que aviva" });
    expect(tomDaCombinacao("fogo", "ar")).toEqual(tomDaCombinacao("ar", "fogo"));
  });

  it("o pedido recusa data fora da faixa e e-mail inválido", () => {
    const base = { nome_dela: "Ana", nascimento_dela: "1990-05-01", nome_dele: "João", nascimento_dele: "1988-09-30", email: "ana@exemplo.com", forma: "pix" };
    expect(pedidoDoQuizSchema.safeParse(base).success).toBe(true);
    expect(pedidoDoQuizSchema.safeParse({ ...base, nascimento_dela: "2020-01-01" }).success).toBe(false);
    expect(pedidoDoQuizSchema.safeParse({ ...base, email: "ana" }).success).toBe(false);
  });

  it("a prévia tem um ponto forte e um ponto de atenção com nome, para todo par de elementos", () => {
    const elementos = ["fogo", "terra", "ar", "água"] as const;
    for (const a of elementos)
      for (const b of elementos) {
        const t = tomDaCombinacao(a, b);
        expect(t.titulo).not.toBe("Um encontro único");
        expect(t.forte.length).toBeGreaterThan(10);
        expect(t.atencao.length).toBeGreaterThan(10);
      }
  });

  it("o pedido aceita as respostas dos seis toques e recusa chave que o quiz não pergunta", () => {
    const base = { nome_dela: "Ana", nascimento_dela: "1990-05-01", nome_dele: "João", nascimento_dele: "1988-09-30", email: "ana@exemplo.com", forma: "pix" };
    const respostas = Object.fromEntries(PERGUNTAS_DO_QUIZ.map((p) => [p.id, p.opcoes[0]]));
    expect(pedidoDoQuizSchema.safeParse({ ...base, respostas }).success).toBe(true);
    expect(pedidoDoQuizSchema.safeParse({ ...base, respostas: { outra: "x" } }).success).toBe(false);
    // Toda pergunta tem rótulo no pedido da leitura, e toda opção cabe no limite do servidor.
    for (const p of PERGUNTAS_DO_QUIZ) {
      expect(ROTULO_DA_RESPOSTA[p.id]).toBeTruthy();
      for (const o of p.opcoes) expect(o.length).toBeLessThanOrEqual(80);
    }
  });
});
