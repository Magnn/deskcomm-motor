import { describe, expect, it } from "vitest";

import { anunciouPausa } from "./pausa-anunciada";

describe("anunciouPausa", () => {
  it.each([
    "Não sei mudar meu jeito / Estou indo pra casa depôs nois se fala / Nem sai ainda",
    "tô dirigindo, te chamo depois",
    "Vou ver aqui / E retorno",
    "mais tarde eu vejo",
    "quando eu receber eu pago",
    "amanhã eu te falo",
    "to no trabalho",
  ])("pausa: %j", (t) => {
    expect(anunciouPausa(t)).toBe(true);
  });

  it.each(["tá muito caro", "não tenho esse dinheiro", "vou pensar", "ok", "", null])("não é pausa: %j", (t) => {
    expect(anunciouPausa(t)).toBe(false);
  });
});
