/**
 * O RITMO DA RESPOSTA.
 *
 * Medido em produção antes desta mudança: 500 caracteres chegavam em 2 segundos, porque a pausa
 * entre bolhas era só o piso anti-banimento. O que estes testes seguram:
 *  - `rapido` (o padrão) é EXATAMENTE o comportamento de antes — quem não escolhe não muda;
 *  - nos outros ritmos a pausa cresce com o texto da PRÓXIMA bolha, tem teto e nunca fica abaixo
 *    do piso anti-banimento;
 *  - o "digitando…" é aceso entre as bolhas, e a pausa é a da bolha que vai sair.
 */
import { describe, expect, it, vi } from "vitest";

import { calcularAtrasoHumano } from "@/lib/agent-engine/agent/atraso-humano";
import { sendInBubbles } from "@/lib/agent-engine/agent/split-message";
import {
  PAUSA_ANTES_DA_PRIMEIRA,
  PAUSA_ENTRE_BOLHAS,
  PISO_ENTRE_BOLHAS_MS,
  RITMO_PADRAO,
  lerRitmo,
  pausaEntreBolhas,
  ritmoSchema,
  sinalizaDigitandoEntreBolhas,
} from "@/lib/ritmo/tipos";

const meio = () => 0.5;

describe("lerRitmo — o padrão é o comportamento de sempre", () => {
  it("sem configuração, ou com shape estranho: rapido", () => {
    expect(RITMO_PADRAO).toBe("rapido");
    for (const config of [null, undefined, {}, { ritmo: null }, { ritmo: "natural" }, { ritmo: { modo: "voando" } }]) {
      expect(lerRitmo(config)).toBe("rapido");
    }
  });

  it("lê o modo gravado", () => {
    expect(lerRitmo({ ritmo: { modo: "natural" } })).toBe("natural");
    expect(lerRitmo({ pricing: {}, ritmo: { modo: "calmo" } })).toBe("calmo");
  });

  it("o schema recusa modo que não existe", () => {
    expect(ritmoSchema.safeParse({ modo: "lento" }).success).toBe(false);
    expect(ritmoSchema.safeParse({ modo: "natural" }).success).toBe(true);
  });
});

describe("pausaEntreBolhas", () => {
  it("⭐ rapido é exatamente o de antes: 1,2 s + até 0,8 s, sem olhar o texto", () => {
    expect(pausaEntreBolhas("rapido", "x".repeat(600), () => 0)).toBe(1200);
    expect(pausaEntreBolhas("rapido", "", () => 0.999)).toBe(1200 + Math.floor(0.999 * 800));
    expect(pausaEntreBolhas("rapido", "oi", meio)).toBe(pausaEntreBolhas("rapido", "x".repeat(600), meio));
    expect(sinalizaDigitandoEntreBolhas("rapido")).toBe(false);
  });

  it("⭐ natural: a pausa é o tempo de digitar a PRÓXIMA bolha — 150 caracteres levam ~8 s, não 2", () => {
    const ms = pausaEntreBolhas("natural", "x".repeat(150), meio);
    expect(ms).toBe(1500 + 45 * 150);
    expect(ms).toBeGreaterThan(7000);
    expect(pausaEntreBolhas("natural", "Sim!", meio)).toBeLessThan(2000);
    expect(sinalizaDigitandoEntreBolhas("natural")).toBe(true);
  });

  it("cresce com o texto e para no teto", () => {
    const curta = pausaEntreBolhas("natural", "x".repeat(40), meio);
    const media = pausaEntreBolhas("natural", "x".repeat(120), meio);
    expect(media).toBeGreaterThan(curta);
    for (const ritmo of ["natural", "calmo"] as const) {
      const teto = PAUSA_ENTRE_BOLHAS[ritmo]!.maximoMs;
      expect(pausaEntreBolhas(ritmo, "x".repeat(4000), () => 0.999)).toBeLessThanOrEqual(teto);
    }
  });

  it("nunca fica abaixo do piso anti-banimento, qualquer que seja a variação", () => {
    for (const ritmo of ["rapido", "natural", "calmo"] as const) {
      for (const sorte of [0, 0.5, 0.999]) {
        expect(pausaEntreBolhas(ritmo, "", () => sorte)).toBeGreaterThanOrEqual(PISO_ENTRE_BOLHAS_MS);
      }
    }
  });

  it("a variação é de ±15%: pausas idênticas entre todas as bolhas também denunciam", () => {
    const base = 1500 + 45 * 100;
    expect(pausaEntreBolhas("natural", "x".repeat(100), () => 0)).toBe(Math.round(base * 0.85));
    expect(pausaEntreBolhas("natural", "x".repeat(100), () => 0.999)).toBeLessThanOrEqual(Math.round(base * 1.15));
  });

  it("calmo é mais lento que natural para o mesmo texto", () => {
    expect(pausaEntreBolhas("calmo", "x".repeat(100), meio)).toBeGreaterThan(pausaEntreBolhas("natural", "x".repeat(100), meio));
  });
});

describe("a pausa antes da primeira bolha", () => {
  it("⭐ no rapido (e sem ritmo) os números são os de sempre", () => {
    for (const texto of ["Sim!", "x".repeat(100), "x".repeat(2000)]) {
      expect(calcularAtrasoHumano(texto, PAUSA_ANTES_DA_PRIMEIRA.rapido)).toBe(calcularAtrasoHumano(texto));
    }
    expect(calcularAtrasoHumano("x".repeat(2000))).toBe(7500);
  });

  it("natural e calmo esperam mais e têm teto maior", () => {
    const texto = "x".repeat(200);
    const rapido = calcularAtrasoHumano(texto);
    const natural = calcularAtrasoHumano(texto, PAUSA_ANTES_DA_PRIMEIRA.natural);
    const calmo = calcularAtrasoHumano(texto, PAUSA_ANTES_DA_PRIMEIRA.calmo);
    expect(natural).toBeGreaterThan(rapido);
    expect(calmo).toBeGreaterThan(natural);
    expect(calcularAtrasoHumano("x".repeat(5000), PAUSA_ANTES_DA_PRIMEIRA.natural)).toBe(12_000);
  });
});

describe("sendInBubbles — a pausa conhece a bolha que vai sair", () => {
  it("⭐ entre bolhas: acende o digitando, espera o tempo DA PRÓXIMA bolha, e só então envia", async () => {
    const ordem: string[] = [];
    const corpo = "primeira parte.\n\nsegunda parte bem mais longa do que a primeira, para a pausa ser outra.\n\nfim.";
    await sendInBubbles(corpo, {
      enabled: true,
      maxChars: 60,
      send: async (b) => {
        ordem.push(`envia:${b.length}`);
        return { kind: "sent" };
      },
      sleep: async (ms) => {
        ordem.push(`espera:${ms}`);
      },
      jitter: (proxima) => proxima.length * 10,
      aoEsperarEntre: () => ordem.push("digitando"),
    });

    const enviadas = ordem.filter((o) => o.startsWith("envia:")).map((o) => Number(o.slice(6)));
    expect(enviadas.length).toBeGreaterThanOrEqual(2);
    // Nada antes da primeira (a pausa dela é do turno); depois, sempre digitando → espera → envia.
    expect(ordem[0]).toBe(`envia:${enviadas[0]}`);
    for (let i = 1; i < enviadas.length; i += 1) {
      const pos = ordem.indexOf(`envia:${enviadas[i]}`, 1);
      expect(ordem[pos - 2]).toBe("digitando");
      expect(ordem[pos - 1]).toBe(`espera:${enviadas[i]! * 10}`);
    }
  });

  it("sem o gancho do digitando, segue como antes", async () => {
    const sleep = vi.fn(async () => undefined);
    const r = await sendInBubbles("a.\n\nb.", { enabled: true, maxChars: 2, send: async () => ({ kind: "sent" }), sleep, jitter: () => 1200 });
    expect(r.kind).toBe("sent");
    expect(sleep).toHaveBeenCalledWith(1200);
  });
});
