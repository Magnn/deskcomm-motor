/**
 * De quem é a vez no envio (`chaveDaVezDoEnvio`).
 *
 * Em 07/10/2026 um número oficial com ~12 conversas por minuto concluía 5–7 turnos por
 * minuto: a pausa entre bolhas e a síntese de voz de um cliente seguravam a vez do número
 * inteiro. A fila por número só protege pacing e copies, que não armam sem `banRisk`.
 */
import { describe, expect, it } from "vitest";

import { chaveDaVezDoEnvio } from "@/lib/agent-engine/guardrails/before-send";
import { capabilitiesOf } from "@/lib/channels/capabilities";

const NUMERO = "11111111-1111-1111-1111-111111111111";

describe("chaveDaVezDoEnvio", () => {
  it("canal com risco de banimento: a vez é do número, seja qual for o contato", () => {
    expect(capabilitiesOf("waha").banRisk).toBe(true);
    expect(chaveDaVezDoEnvio("waha", NUMERO, "lead-a")).toBe(NUMERO);
    expect(chaveDaVezDoEnvio("waha", NUMERO, "lead-b")).toBe(NUMERO);
  });

  it("canal sem risco de banimento: contatos diferentes não esperam um pelo outro", () => {
    expect(capabilitiesOf("meta_cloud").banRisk).toBe(false);
    const a = chaveDaVezDoEnvio("meta_cloud", NUMERO, "lead-a");
    const b = chaveDaVezDoEnvio("meta_cloud", NUMERO, "lead-b");
    expect(a).not.toBe(b);
    expect(a).not.toBe(NUMERO);
  });

  it("canal sem risco: o mesmo contato no mesmo número continua em fila", () => {
    expect(chaveDaVezDoEnvio("meta_cloud", NUMERO, "lead-a")).toBe(
      chaveDaVezDoEnvio("meta_cloud", NUMERO, "lead-a"),
    );
  });
});
