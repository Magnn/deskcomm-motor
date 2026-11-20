import { describe, expect, it } from "vitest";
import { vetoDeTentativaAnterior } from "./veto-de-tentativa-anterior";

describe("vetoDeTentativaAnterior", () => {
  it("lê o código do veto que o turno gravou ao re-tentar (Obede, 20/11)", () => {
    expect(
      vetoDeTentativaAnterior(
        "turno terminou sem resposta depois do veto promise_out_of_table — run re-tentado pela fila",
      ),
    ).toBe("promise_out_of_table");
  });
  it("outro erro, ou nenhum, não conta como veto", () => {
    expect(vetoDeTentativaAnterior("envio marcado como failed pelo CRM — run re-tentado pela fila")).toBeNull();
    expect(vetoDeTentativaAnterior(null)).toBeNull();
    expect(vetoDeTentativaAnterior(undefined)).toBeNull();
  });
});
