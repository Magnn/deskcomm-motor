/**
 * Migration 0963 — o que o motor de ritmo passou a contar.
 *
 * 1. O AQUECIMENTO conta só o que NÓS iniciamos (`initiatedToday`): resposta a quem
 *    escreveu não gasta o teto que existe contra disparo. O limite do CRM conta tudo.
 * 2. O TETO POR HORA conta tudo e veta com a hora da próxima vaga (o mais antigo da
 *    última hora completa 60 min). Só arma onde há risco de ban e quando configurado.
 * 3. A mesma regra vale no lado Supabase (`decidirEspacamento`), que só aplica o teto
 *    por hora a quem pede.
 * 4. O tipo do envio é deduzido da última mensagem do lead quando ninguém declara.
 */
import { describe, expect, it } from "vitest";

import { JANELA_DE_RESPOSTA_MS, PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { decidePacing, proximaVagaNaHora } from "@/lib/agent-engine/pacing/engine";
import { decidirEspacamento } from "@/lib/agent-engine/pacing/ledger-supabase";
import { tipoDoEnvio } from "@/lib/agent-engine/guardrails/before-send";

// Terça, 14h em São Paulo: dentro da janela padrão.
const agora = new Date("2026-11-17T17:00:00Z");
const novo = { numberActivatedAt: agora, lastSentAt: null }; // idade 0: aquecimento de 20/dia

describe("aquecimento conta só o que iniciamos", () => {
  it("20 envios hoje, mas só 5 iniciados: libera", () => {
    const d = decidePacing({
      now: agora,
      knobs: PACING_DEFAULTS,
      state: { ...novo, sentToday: 20, initiatedToday: 5 },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d.allow).toBe(true);
  });

  it("20 iniciados: veta por aquecimento", () => {
    const d = decidePacing({
      now: agora,
      knobs: PACING_DEFAULTS,
      state: { ...novo, sentToday: 20, initiatedToday: 20 },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d).toMatchObject({ allow: false, code: "warmup_cap" });
  });

  it("o limite do CRM conta respostas também", () => {
    const d = decidePacing({
      now: agora,
      knobs: PACING_DEFAULTS,
      state: { ...novo, sentToday: 100, initiatedToday: 0 },
      crmDailyLimit: 100,
      rng: () => 0,
    });
    expect(d).toMatchObject({ allow: false, code: "daily_cap" });
  });

  it("leitor antigo, sem initiatedToday: cai no total (conservador)", () => {
    const d = decidePacing({
      now: agora,
      knobs: PACING_DEFAULTS,
      state: { ...novo, sentToday: 20 },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d).toMatchObject({ allow: false, code: "warmup_cap" });
  });
});

describe("teto por hora", () => {
  const knobs = { ...PACING_DEFAULTS, warmupDailyCaps: [{ minAgeDays: 0, cap: null }], maxPerHour: 20 };
  const maisAntigo = new Date(agora.getTime() - 40 * 60_000);

  it("cheio: veta e marca a vaga para quando o mais antigo completar 1 hora", () => {
    const d = decidePacing({
      now: agora,
      knobs,
      state: { ...novo, sentToday: 20, sentLastHour: 20, oldestInLastHourAt: maisAntigo },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d).toMatchObject({ allow: false, code: "hourly_cap" });
    if (!d.allow) expect(d.nextAllowedAt.getTime()).toBe(maisAntigo.getTime() + 3_600_000);
  });

  it("abaixo do teto: libera", () => {
    const d = decidePacing({
      now: agora,
      knobs,
      state: { ...novo, sentToday: 19, sentLastHour: 19, oldestInLastHourAt: maisAntigo },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d.allow).toBe(true);
  });

  it("sem teto configurado: nunca veta por hora", () => {
    expect(proximaVagaNaHora(agora, { maxPerHour: null, jitterMaxMs: 0 }, { sentLastHour: 999 })).toBeNull();
  });

  it("canal oficial (sem risco de ban) não arma o teto por hora", () => {
    const d = decidePacing({
      now: agora,
      knobs,
      state: { ...novo, sentToday: 50, sentLastHour: 50, oldestInLastHourAt: maisAntigo },
      crmDailyLimit: null,
      banRisk: false,
      rng: () => 0,
    });
    expect(d.allow).toBe(true);
  });

  it("desarmado por quem já perguntou no começo do turno", () => {
    const d = decidePacing({
      now: agora,
      knobs,
      state: { ...novo, sentToday: 20, sentLastHour: 20, oldestInLastHourAt: maisAntigo },
      crmDailyLimit: null,
      enforceHourlyCap: false,
      rng: () => 0,
    });
    expect(d.allow).toBe(true);
  });
});

describe("lado Supabase (aviso interno e envio por token)", () => {
  const base = {
    agora,
    throttleMs: 0,
    jitterMaxMs: 0,
    timezone: "America/Sao_Paulo",
    warmupDailyCaps: [{ minAgeDays: 0, cap: 20 }],
    crmDailyLimit: null,
    rng: () => 0,
  };
  const estado = {
    lastSentAt: null,
    numberActivatedAt: agora,
    sentToday: 30,
    initiatedToday: 3,
    sentLastHour: 30,
    oldestInLastHourAt: new Date(agora.getTime() - 10 * 60_000),
  };

  it("respostas não gastam o aquecimento aqui também", () => {
    expect(decidirEspacamento({ ...base, estado })).toEqual({ liberado: true });
  });

  it("teto por hora só para quem pede", () => {
    expect(decidirEspacamento({ ...base, estado, maxPerHour: 30 })).toMatchObject({
      liberado: false,
      motivo: "teto_por_hora",
    });
  });
});

describe("tipo do envio", () => {
  it("declarado vence", () => {
    expect(tipoDoEnvio("resposta", null, agora)).toBe("resposta");
  });
  it("lead escreveu há pouco: resposta", () => {
    expect(tipoDoEnvio(undefined, new Date(agora.getTime() - 60_000), agora)).toBe("resposta");
  });
  it("lead escreveu há mais que a janela: iniciada", () => {
    expect(tipoDoEnvio(undefined, new Date(agora.getTime() - JANELA_DE_RESPOSTA_MS - 1), agora)).toBe("iniciada");
  });
  it("lead nunca escreveu: iniciada", () => {
    expect(tipoDoEnvio(undefined, null, agora)).toBe("iniciada");
  });
});
