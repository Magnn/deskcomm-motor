/**
 * Ficha de Proteção de envio (migration 0963): o orçamento de leads e o teto por hora
 * entram pela mesma validação estrita do resto da ficha, e a tela lê de volta o modo
 * que gravou.
 */
import { describe, expect, it } from "vitest";

import { RAMPA_DE_LEADS } from "@/lib/agent-engine/pacing/defaults";
import {
  degrausDoOrcamento,
  knobsView,
  modoDoOrcamento,
  pacingKnobsUpdateSchema,
} from "@/lib/ai/pacing-knobs";

const sessao = "6f1c3c1e-2b1a-4c8e-9a51-1d6f3b2c9a10";

describe("validação", () => {
  it("aceita número, rampa e null", () => {
    for (const lead_daily_cap of [24, "rampa", null] as const) {
      expect(pacingKnobsUpdateSchema.safeParse({ channel_session_id: sessao, lead_daily_cap }).success).toBe(true);
    }
  });

  it("recusa zero, negativo e texto solto", () => {
    for (const lead_daily_cap of [0, -1, "muito"]) {
      expect(pacingKnobsUpdateSchema.safeParse({ channel_session_id: sessao, lead_daily_cap }).success).toBe(false);
    }
    expect(pacingKnobsUpdateSchema.safeParse({ channel_session_id: sessao, max_per_hour: 0 }).success).toBe(false);
    expect(pacingKnobsUpdateSchema.safeParse({ channel_session_id: sessao, max_per_hour: 30 }).success).toBe(true);
  });
});

describe("ida e volta do orçamento", () => {
  it("24 por dia vira um degrau só, e a tela lê 'fixo' com 24 hoje", () => {
    const steps = degrausDoOrcamento(24);
    expect(steps).toEqual([{ minAgeDays: 0, cap: 24 }]);
    expect(modoDoOrcamento(steps)).toBe("fixo");
  });

  it("rampa grava os degraus da rampa e lê 'rampa'", () => {
    expect(modoDoOrcamento(degrausDoOrcamento("rampa"))).toBe("rampa");
    expect(degrausDoOrcamento("rampa")).toEqual(RAMPA_DE_LEADS);
  });

  it("null é sem orçamento", () => {
    expect(degrausDoOrcamento(null)).toBeNull();
    expect(modoDoOrcamento(null)).toBe("sem_limite");
  });

  it("a ficha mostra o orçamento e o teto por hora gravados", () => {
    const v = knobsView({
      throttle_ms: null,
      jitter_max_ms: null,
      window_start_hour: null,
      window_end_hour: null,
      allow_sunday: null,
      timezone: null,
      warmup_daily_caps: null,
      max_per_hour: 30,
      lead_daily_caps: [{ minAgeDays: 0, cap: 24 }],
    });
    expect(v.leads).toMatchObject({ mode: "fixo", cap_today: 24 });
    expect(v.effective.maxPerHour).toBe(30);
  });
});
