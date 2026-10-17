/**
 * A RESPOSTA A QUEM ESCREVEU NÃO DISPUTA O TETO DO DIA.
 *
 * Medido em produção em 17/10/2026: num número de 2 dias de aquecimento (teto de
 * 20/dia), a campanha e a própria conversa gastaram o teto às 9h, e o turno de
 * quem tinha acabado de mandar um áudio foi adiado para as 8h do dia seguinte
 * ("cap de envio (warmup_cap) atingido — turno adiado"). O teto existe contra
 * disparo; responder não é disparo.
 *
 * `runAgentTurn` não tem seam isolável sem harness pesado (mesmo motivo de
 * `gate-vazamento-interno.test.ts`), então a prova é dupla: o motor de ritmo
 * libera com o teto desarmado mantendo janela e intervalo (casos de
 * `fluxo-dispara-sem-trava-de-volume.test.ts`), e aqui se mede que SÓ o turno de
 * entrada pede o desarme, nos dois envios de texto do modelo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { decidePacing } from "@/lib/agent-engine/pacing/engine";

const fonte = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

describe("a resposta a quem escreveu não disputa o teto do dia", () => {
  it("o desarme vale só para o turno de entrada", () => {
    expect(fonte).toMatch(
      /const TETO_DO_TURNO = \(\)[^=]*=>\s*liveJob\(\)\.kind === 'inbound_turn' \? \{ enforceDailyCaps: false \} : \{\};/,
    );
  });

  it("o texto do modelo e a pergunta do roteiro pedem o desarme", () => {
    const usos = fonte.match(/\.\.\.TETO_DO_TURNO\(\),/g) ?? [];
    expect(usos).toHaveLength(2);
    const argsDoTexto = fonte.slice(fonte.indexOf("const beforeSendArgs = {"));
    expect(argsDoTexto.slice(0, argsDoTexto.indexOf("};"))).toContain("...TETO_DO_TURNO(),");
  });

  it("o template (canal oficial fora da janela) segue com o teto armado", () => {
    const template = fonte.slice(fonte.indexOf("isTemplate: true"));
    expect(template.slice(0, template.indexOf("send:"))).not.toContain("TETO_DO_TURNO");
  });

  it("controle: com o teto armado, o mesmo estado do número É vetado", () => {
    const d = decidePacing({
      now: new Date("2026-10-17T13:23:00Z"),
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 20, numberActivatedAt: null },
      crmDailyLimit: null,
      rng: () => 0,
    });
    expect(d).toMatchObject({ allow: false, code: "warmup_cap" });
    const solta = decidePacing({
      now: new Date("2026-10-17T13:23:00Z"),
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 20, numberActivatedAt: null },
      crmDailyLimit: null,
      rng: () => 0,
      enforceDailyCaps: false,
    });
    expect(solta.allow).toBe(true);
  });
});
