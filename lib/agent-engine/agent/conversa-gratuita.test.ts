/**
 * O limite da conversa gratuita: quem ouviu a oferta e não comprou tem um número de respostas de graça.
 *
 * As direções que importam: cortar o atendimento sem fim; NUNCA cortar a venda acontecendo (rodada que fala
 * de pagar); e NUNCA cortar quem dá sinal de risco.
 */
import { describe, expect, it } from 'vitest';

import { blocoDaConversaGratuitaEsgotada, conversaGratuitaEsgotada } from './conversa-gratuita';

const m = (direction: 'inbound' | 'outbound', body: string) => ({ direction, body });
const OFERTA = m('outbound', 'O seu trabalho completo é R$ 130, uma vez só.');
const AG = m('outbound', 'Eu sei, meu bem. Me conta mais.');

describe('conversaGratuitaEsgotada', () => {
  it('⭐ o caso medido: depois da oferta ela só desabafa, e a terceira rodada passa do limite de duas', () => {
    const conversa = [OFERTA, m('inbound', 'Faria tantas coisas'), AG, m('inbound', 'Montaria na moto e andaria livre'), AG, m('inbound', 'Eu pensava em alguém')];
    expect(conversaGratuitaEsgotada(conversa, 2)).toBe(true);
    expect(conversaGratuitaEsgotada(conversa.slice(0, 4), 2)).toBe(false);
    expect(conversaGratuitaEsgotada(conversa, 3)).toBe(false);
  });

  it('⭐ a rodada que fala de pagar nunca é limitada: é a venda acontecendo', () => {
    const base = [OFERTA, m('inbound', 'ele sumiu'), AG, m('inbound', 'tô triste'), AG];
    for (const fala of ['quanto fica a pergunta?', 'quero', 'tenho 50', 'posso pagar dia 15', 'como eu faço o pix', 'manda o link', 'isso funciona mesmo?', 'já fui enganada', 'tem garantia']) {
      expect(conversaGratuitaEsgotada([...base, m('inbound', fala)], 2), fala).toBe(false);
    }
  });

  it('⭐ sinal de risco desliga o limite: o cuidado vem antes da cobrança', () => {
    const base = [OFERTA, m('inbound', 'ele sumiu'), AG, m('inbound', 'tô triste'), AG];
    expect(conversaGratuitaEsgotada([...base, m('inbound', 'não quero mais viver assim')], 2)).toBe(false);
    expect(conversaGratuitaEsgotada([...base, m('inbound', 'ele me bateu ontem')], 2)).toBe(false);
  });

  it('rodadas comerciais anteriores não gastam a conversa gratuita', () => {
    const conversa = [OFERTA, m('inbound', 'não tenho esse valor'), AG, m('inbound', 'só dia 20'), AG, m('inbound', 'ele vai gostar de mim?')];
    expect(conversaGratuitaEsgotada(conversa, 2)).toBe(false);
  });

  it('antes da oferta, sem limite configurado e sem mensagem nova, a regra não vale', () => {
    expect(conversaGratuitaEsgotada([m('outbound', 'CARTA 1: O Sol'), m('inbound', 'sim'), AG, m('inbound', 'sim'), AG, m('inbound', 'sim')], 1)).toBe(false);
    const conversa = [OFERTA, m('inbound', 'oi'), AG, m('inbound', 'saudade'), AG, m('inbound', 'tô mal')];
    expect(conversaGratuitaEsgotada(conversa, undefined)).toBe(false);
    expect(conversaGratuitaEsgotada(conversa, 0)).toBe(false);
    expect(conversaGratuitaEsgotada([...conversa, AG], 2)).toBe(false);
  });
});

describe('blocoDaConversaGratuitaEsgotada', () => {
  it('manda responder uma vez, curto, com os caminhos pagos, e proíbe aconselhar', () => {
    expect(blocoDaConversaGratuitaEsgotada(false, [])).toBe('');
    const bloco = blocoDaConversaGratuitaEsgotada(true, ['o trabalho', 'Pergunta nova', 'Acompanhamento do mês']);
    expect(bloco).toContain('o trabalho, Pergunta nova, Acompanhamento do mês');
    expect(bloco).toContain('UMA mensagem só');
    expect(bloco).toContain('PROIBIDO neste turno: aconselhar');
  });
});

describe('silencioPorConversaGratuita', () => {
  const rodada = (texto: string) => [m('inbound', texto), AG];
  const longa = [OFERTA, ...rodada('ele sumiu'), ...rodada('tô triste'), ...rodada('saudade'), ...rodada('não durmo')];

  it('⭐ depois do limite e dos dois avisos, o turno não responde mais', async () => {
    const { silencioPorConversaGratuita } = await import('./conversa-gratuita');
    expect(silencioPorConversaGratuita([...longa, m('inbound', 'queria desabafar')], 2)).toBe(true);
    // No limite e no primeiro aviso ainda há resposta (curta).
    expect(silencioPorConversaGratuita([OFERTA, ...rodada('a'), ...rodada('b'), m('inbound', 'c')], 2)).toBe(false);
    expect(silencioPorConversaGratuita([OFERTA, ...rodada('a'), ...rodada('b'), ...rodada('c'), m('inbound', 'd')], 2)).toBe(false);
  });

  it('⭐ falar de compra, mandar foto ou dar sinal de risco reabre o atendimento na hora', async () => {
    const { silencioPorConversaGratuita } = await import('./conversa-gratuita');
    for (const fala of ['quero a pergunta', 'consegui o dinheiro', '[image]', '[o cliente enviou uma mídia que não consegui interpretar]', 'não quero mais viver']) {
      expect(silencioPorConversaGratuita([...longa, m('inbound', fala)], 2), fala).toBe(false);
    }
  });

  it('sem limite configurado, nunca silencia', async () => {
    const { silencioPorConversaGratuita } = await import('./conversa-gratuita');
    expect(silencioPorConversaGratuita([...longa, m('inbound', 'oi')], undefined)).toBe(false);
  });
});
