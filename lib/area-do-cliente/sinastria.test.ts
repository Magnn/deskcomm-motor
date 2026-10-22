import { describe, expect, it } from "vitest";

import { pedidoDoQuizSchema, previaDaSinastria, signoDe, tomDaCombinacao } from "./sinastria";

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
});
