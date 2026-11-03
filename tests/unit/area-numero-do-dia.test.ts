/**
 * Número e cor do dia (`lib/area-do-cliente/numero-do-dia.ts`): dia pessoal com o nascimento, dia universal sem, e
 * todo texto tem tradução em espanhol.
 */
import { describe, expect, it } from "vitest";

import { CORES_DOS_NUMEROS, numeroDoDia } from "@/lib/area-do-cliente/numero-do-dia";
import { DICIONARIO } from "@/lib/i18n/dicionario";

describe("número e cor do dia", () => {
  it("⭐ com o nascimento, é o dia pessoal: ano pessoal + mês + dia de hoje", () => {
    // nascida 15/03: ano pessoal 2026 = 6+3+1 = 1; hoje 02/11 → 1+2+2 = 5 (azul-claro).
    const n = numeroDoDia("2026-11-02", "1990-03-15");
    expect(n).toMatchObject({ numero: 5, pessoal: true, cor: "Azul-claro" });
  });

  it("sem nascimento, é o dia universal e muda de um dia para o outro", () => {
    const hoje = numeroDoDia("2026-11-02", null);
    expect(hoje).toMatchObject({ numero: 5, pessoal: false }); // 2026→1, 11→2, dia 2 → 5
    expect(numeroDoDia("2026-11-03", null).numero).toBe(6);
  });

  it("sempre de 1 a 9, o ano inteiro", () => {
    for (let d = 0; d < 366; d++) {
      const dia = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const n = numeroDoDia(dia, "1985-12-29").numero;
      expect(n >= 1 && n <= 9).toBe(true);
    }
  });

  it("toda cor e todo sentido têm espanhol", () => {
    const dic = DICIONARIO as Record<string, { es?: string }>;
    for (const c of Object.values(CORES_DOS_NUMEROS)) {
      expect(dic[c.cor]?.es).toBeTruthy();
      expect(dic[c.sentido]?.es).toBeTruthy();
    }
    for (const k of ["Seu número de hoje", "Número do dia", "cor"]) expect(dic[k]?.es).toBeTruthy();
  });
});
