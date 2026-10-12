/**
 * A resposta atropelada: a pessoa escreveu de novo sem ter lido a resposta anterior.
 *
 * As duas direções importam: reconhecer o atropelo (senão a agente repete acolhida e pergunta) e NÃO
 * confundir com a resposta rápida a uma pergunta (senão o turno normal ganha uma instrução de encurtar).
 */
import { describe, expect, it } from 'vitest';

import { blocoDaRespostaAtropelada, respostaAtropelada } from './resposta-atropelada';

const em = (direction: 'inbound' | 'outbound', segundos: number) => ({
  direction,
  sent_at: new Date(Date.UTC(2026, 9, 12, 1, 0, segundos)).toISOString(),
});

describe('respostaAtropelada', () => {
  it('⭐ a segunda mensagem chegou segundos depois do primeiro balão da resposta', () => {
    expect(respostaAtropelada([em('inbound', 0), em('outbound', 30), em('outbound', 39), em('inbound', 42)])).toBe(true);
  });

  it('⭐ a segunda mensagem chegou no meio da resposta: há balão da agente depois dela', () => {
    expect(respostaAtropelada([em('inbound', 0), em('outbound', 30), em('inbound', 70), em('outbound', 75)])).toBe(true);
  });

  it('resposta rápida a uma pergunta não é atropelo: ela leu antes de escrever', () => {
    expect(respostaAtropelada([em('inbound', 0), em('outbound', 30), em('outbound', 39), em('inbound', 80)])).toBe(false);
  });

  it('duas mensagens seguidas sem fala da agente no meio são uma rajada comum, não atropelo', () => {
    expect(respostaAtropelada([em('outbound', 0), em('inbound', 300), em('inbound', 310)])).toBe(false);
  });

  it('primeira mensagem da conversa, histórico vazio e hora ilegível: nunca atropelo', () => {
    expect(respostaAtropelada([em('inbound', 0)])).toBe(false);
    expect(respostaAtropelada([])).toBe(false);
    expect(respostaAtropelada([em('inbound', 0), { direction: 'outbound', sent_at: 'x' }, em('inbound', 5)])).toBe(false);
  });
});

describe('blocoDaRespostaAtropelada', () => {
  it('só existe no turno atropelado e manda não repetir', () => {
    expect(blocoDaRespostaAtropelada(false)).toBe('');
    expect(blocoDaRespostaAtropelada(true)).toContain('NÃO repita');
  });
});
