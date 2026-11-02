/**
 * O limite da conversa gratuita: quem ouviu a oferta e não comprou tem um número de respostas de graça.
 *
 * As direções que importam: cortar o atendimento sem fim; NUNCA cortar a venda acontecendo (rodada que fala
 * de pagar); e NUNCA cortar quem dá sinal de risco.
 */
import { describe, expect, it } from 'vitest';

import { blocoDaConversaGratuitaEsgotada, conversaGratuitaEsgotada, ofereceuHoje } from './conversa-gratuita';

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
  it('sem valor dito hoje, liga o que ela contou a uma oferta', () => {
    expect(blocoDaConversaGratuitaEsgotada(false, [])).toBe('');
    const bloco = blocoDaConversaGratuitaEsgotada(true, ['o trabalho', 'Pergunta nova']);
    expect(bloco).toContain('UMA mensagem só');
    expect(bloco).toContain('o trabalho, Pergunta nova');
    expect(bloco).toContain('quanto ela consegue hoje');
    expect(bloco).toContain('É PROIBIDO');
  });

  it('⭐ com valor dito hoje, responde sem repetir oferta, e nunca se cala', () => {
    const bloco = blocoDaConversaGratuitaEsgotada(true, ['o trabalho', 'Pergunta nova'], true);
    expect(bloco).toContain('NÃO repita esse valor');
    expect(bloco).toContain('A oferta do trabalho volta em outro dia');
    expect(bloco).toContain('ofereça UMA destas, a que mais responde ao que ela contou: Pergunta nova');
    expect(bloco).toContain('Termine sempre com uma pergunta curta');
    expect(blocoDaConversaGratuitaEsgotada(true, ['o trabalho'], true)).not.toContain('ofereça UMA destas');
  });

  it('a oferta volta no dia seguinte', () => {
    const agora = new Date('2026-11-02T12:00:00Z');
    const fala = (sent_at: string) => [{ direction: 'outbound', body: 'O trabalho é R$ 130.', sent_at }];
    expect(ofereceuHoje(fala('2026-11-02T08:00:00Z'), agora)).toBe(true);
    expect(ofereceuHoje(fala('2026-11-01T12:00:00Z'), agora)).toBe(false);
  });
});

describe('resposta a uma pergunta de pagamento', () => {
  const rodada = (texto: string) => [m('inbound', texto), AG];
  const longa = [OFERTA, ...rodada('ele sumiu'), ...rodada('tô triste'), ...rodada('saudade'), ...rodada('não durmo')];
  const NOVA_OFERTA = m('outbound', 'Hoje eu consegui baixar o valor: de R$ 130 por R$ 60. Quer que eu te mande o Pix de R$ 60 agora?');

  it('⭐ o caso medido: "não sei ainda" depois de "quer o Pix?" é a venda acontecendo, não conversa gratuita', async () => {
    const { conversaGratuitaEsgotada } = await import('./conversa-gratuita');
    for (const fala of ['Não sei ainda', 'Tudo bem', 'Vai falar sobre hoje ainda']) {
      expect(conversaGratuitaEsgotada([...longa, NOVA_OFERTA, m('inbound', fala)], 2), fala).toBe(false);
    }
  });

  it('pergunta que não é de pagamento não reabre', async () => {
    const { conversaGratuitaEsgotada } = await import('./conversa-gratuita');
    const aviso = m('outbound', 'Pra eu seguir com você, preciso que escolha um caminho. Qual você prefere?');
    expect(conversaGratuitaEsgotada([...longa, aviso, m('inbound', 'queria desabafar')], 2)).toBe(true);
  });
});

describe('dúvida sobre a oferta é comercial', () => {
  it('⭐ casos medidos em 12/10: quem diz que está com dúvida, que não entendeu ou pede para esperar é atendido', async () => {
    const { conversaGratuitaEsgotada } = await import('./conversa-gratuita');
    const rodada = (texto: string) => [m('inbound', texto), AG];
    const longa = [OFERTA, ...rodada('ele sumiu'), ...rodada('tô triste'), ...rodada('saudade'), ...rodada('não durmo')];
    for (const fala of ['To com dúvida', 'Nao sei e que nao entendo', 'Vc pode espera', 'como funciona isso']) {
      expect(conversaGratuitaEsgotada([...longa, m('inbound', fala)], 2), fala).toBe(false);
    }
  });
});
