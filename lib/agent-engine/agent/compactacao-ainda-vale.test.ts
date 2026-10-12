/**
 * A última compactação ainda vale? Depois da 40ª mensagem, todo turno refazia o flush e a compactação da
 * conversa inteira. A regra só deixa compactar de novo quando chegou conversa nova o bastante.
 */
import { describe, expect, it } from 'vitest';

import { NOVAS_MENSAGENS_PARA_RECOMPACTAR, compactacaoAindaVale } from './compaction';

const em = (minuto: number) => ({ sent_at: new Date(Date.UTC(2026, 9, 12, 12, minuto)).toISOString() });
const conversa = Array.from({ length: 50 }, (_, i) => em(i));

describe('compactacaoAindaVale', () => {
  it('⭐ poucas mensagens novas desde a última compactação: reaproveita', () => {
    expect(compactacaoAindaVale(conversa, new Date(Date.UTC(2026, 9, 12, 12, 45)))).toBe(true);
  });

  it('⭐ conversa nova o bastante, ou nunca compactada: compacta', () => {
    expect(compactacaoAindaVale(conversa, new Date(Date.UTC(2026, 9, 12, 12, 10)))).toBe(false);
    expect(compactacaoAindaVale(conversa, null)).toBe(false);
  });

  it('o limite é o número de mensagens novas; hora ilegível conta como nova', () => {
    const corte = new Date(Date.UTC(2026, 9, 12, 12, 49 - NOVAS_MENSAGENS_PARA_RECOMPACTAR));
    expect(compactacaoAindaVale(conversa, corte)).toBe(false);
    expect(compactacaoAindaVale(conversa, new Date(corte.getTime() + 60_000))).toBe(true);
    expect(compactacaoAindaVale([{ sent_at: 'x' }, { sent_at: 'y' }], new Date(), 2)).toBe(false);
  });
});
