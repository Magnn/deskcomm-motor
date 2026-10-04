import { describe, expect, it } from "vitest";

import { MODELOS_DE_JORNADA } from "./modelos";
import { jornadaSchema } from "./tipos";

describe("modelos de jornada", () => {
  it.each(MODELOS_DE_JORNADA.map((m) => [m.nome, m] as const))("%s passa no mesmo schema do servidor", (_nome, m) => {
    const r = jornadaSchema.safeParse(m.jornada);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("todo modelo libera o preço só depois da primeira etapa", () => {
    for (const m of MODELOS_DE_JORNADA) expect(m.jornada.etapas[0]!.libera).not.toContain("preco");
  });
});
