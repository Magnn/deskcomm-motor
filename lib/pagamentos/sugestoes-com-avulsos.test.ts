import { describe, expect, it } from "vitest";

import { enviarPixSchema } from "./enviar-pix-tipos";
import { sugestoesDePagamento } from "./pagamento-recebido";

describe("Enviar Pix lista as cobranças avulsas", () => {
  it("a pergunta nova aparece com o slug da cobrança, e o schema aceita o slug", () => {
    const config = { pricing: { enabled: true, list_price_cents: 13000, extras: [{ name: "Pergunta nova", price_cents: 500, when: "quando a pessoa pedir outra pergunta" }] } };
    const lista = sugestoesDePagamento([config]);
    const pergunta = lista.find((s) => s.produto === "Pergunta nova");
    expect(pergunta).toBeDefined();
    expect(pergunta?.valor_cents).toBe(500);
    expect(pergunta?.extra).toMatch(/^pergunta-nova$/);
    expect(enviarPixSchema.safeParse({ produto: "Pergunta nova", valor_cents: 500, extra: "pergunta-nova" }).success).toBe(true);
    expect(enviarPixSchema.safeParse({ produto: "x", valor_cents: 500, extra: "Não Vale" }).success).toBe(false);
  });
});
