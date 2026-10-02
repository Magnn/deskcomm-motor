/**
 * O gate de TEXTO REPETIDO respeita a capacidade do canal.
 *
 * Ele é anti-banimento: persegue a mesma frase disparada em massa, que derruba
 * número em canal não oficial. Em canal sem risco de banimento ele não se aplica —
 * a MESMA capacidade (`banRisk`) que já desarma a parte anti-ban do pacing.
 *
 * Por que isto importa, medido em produção: um fluxo estático manda a mesma
 * mensagem para todo lead — é o que um roteiro fixo É. Com o gate armado no canal
 * oficial, a terceira pessoa a entrar no funil dentro da janela era vetada
 * (`mass_identical`) e o fluxo inteiro dela era cancelado.
 */
import { describe, expect, it } from 'vitest';

import { evaluateBeforeSend, type GateContext } from '@/lib/agent-engine/guardrails/before-send';
import { PACING_DEFAULTS } from '@/lib/agent-engine/pacing/defaults';
import { SPINNING_DEFAULTS } from '@/lib/agent-engine/spinning/defaults';
import { hashNormalized, normalizeCopy } from '@/lib/agent-engine/spinning/engine';

const COMERCIAL = new Date('2026-07-28T13:00:00Z'); // 10h BRT, terça
const TEXTO = 'Olá! Seja bem-vindo. Para começar, me diga o seu nome.';

/** A janela do número já tem a MESMA mensagem enviada a outros leads. */
const jaEnviada = (vezes: number) =>
  Array.from({ length: vezes }, () => {
    const normalizedText = normalizeCopy(TEXTO);
    return { normalizedText, normalizedHash: hashNormalized(normalizedText) };
  });

function ctx(provider: GateContext['provider'], repeticoes: number): GateContext {
  return {
    now: COMERCIAL,
    body: TEXTO,
    optedOut: false,
    provider,
    pacing: {
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 0, numberActivatedAt: null },
      crmDailyLimit: null,
      rng: () => 0,
    },
    // O contato acabou de escrever: a janela de 24h do canal oficial está aberta.
    messagingWindow: { lastInboundAt: new Date(COMERCIAL.getTime() - 60_000) },
    spinning: { knobs: SPINNING_DEFAULTS, window: jaEnviada(repeticoes) },
    promise: { table: null },
    semanticPromise: null,
    disclosure: { template: null, isFirstOutbound: false, mode: 'inject' },
    lgpd: null,
    casesEnabled: false,
    hasOpenCase: false,
    openedCaseThisTurn: false,
  };
}

const linhaDoSpinning = (c: GateContext) => evaluateBeforeSend(c).trace.find((t) => t.gate === 'spinning');

describe('gate de texto repetido respeita a capacidade do canal', () => {
  it('controle: no canal COM risco de banimento, a mesma mensagem em massa é vetada', () => {
    // Sem este caso o teste de baixo passaria com um gate que nunca veta nada.
    expect(linhaDoSpinning(ctx('waha', 5))).toMatchObject({ verdict: 'veto', code: 'mass_identical' });
  });

  it('no canal oficial (sem risco de banimento), o roteiro fixo sai — e o trace diz que o gate não se aplica', () => {
    const resultado = evaluateBeforeSend(ctx('meta_cloud', 5));
    expect(resultado.veto).toBeNull();
    // `skipped` com código, nunca `pass` silencioso: a auditoria distingue "passou"
    // de "não se aplicava a este canal".
    expect(resultado.trace.find((t) => t.gate === 'spinning')).toEqual({
      gate: 'spinning',
      verdict: 'skipped',
      code: 'not_applicable',
    });
  });

  it('no canal com risco, mensagem que ainda não se repetiu passa normalmente', () => {
    expect(linhaDoSpinning(ctx('waha', 0))).toEqual({ gate: 'spinning', verdict: 'pass' });
  });
});
