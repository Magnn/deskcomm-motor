/**
 * A confirmação curta: "ok", "👍" e figurinha não podem fazer o agente repetir a instrução que acabou de dar.
 *
 * As duas direções: reconhecer a confirmação (senão a cliente recebe a mesma orientação três vezes) e NÃO
 * confundir com escolha ou pergunta (senão o turno que precisa responder ganha a ordem de encurtar).
 */
import { describe, expect, it } from 'vitest';

import { blocoDaConfirmacaoCurta, ehConfirmacaoCurta, rodadaSoDeConfirmacao } from './confirmacao-curta';

const m = (direction: 'inbound' | 'outbound', body: string) => ({ direction, body });
const INSTRUCAO = m('outbound', 'Hoje é a sua 5ª vela: vela branca nova, entre 22h e 23h, no mesmo cantinho.');

describe('ehConfirmacaoCurta', () => {
  it('⭐ palavra de concordância, agradecimento, emoji sozinho, figurinha e reação', () => {
    for (const texto of ['ok', 'Ok!', 'Tá bom', 'tá certo', 'Sim', 'blz', 'Amém 🙏', 'obrigada 🌺', '👍', '🙏🏻🕯️', '[sticker]', '[reaction]', 'Boa noite', 'Vou fazer']) {
      expect(ehConfirmacaoCurta(texto), texto).toBe(true);
    }
  });

  it('⭐ escolha, pergunta, valor e frase com conteúdo não são confirmação', () => {
    for (const texto of ['3 7 12', '2', 'sim, mas quanto custa?', 'tenho 50', 'ok, e ele volta?', 'Sim triste ainda', 'não', 'Vamos deixar este para frente', '']) {
      expect(ehConfirmacaoCurta(texto), texto).toBe(false);
    }
  });
});

describe('rodadaSoDeConfirmacao', () => {
  it('⭐ o caso medido: a instrução foi dada e ela respondeu 👍', () => {
    expect(rodadaSoDeConfirmacao([m('inbound', 'acendi sim'), INSTRUCAO, m('inbound', '👍')])).toBe(true);
    expect(rodadaSoDeConfirmacao([INSTRUCAO, m('inbound', 'ok'), m('inbound', 'obrigada')])).toBe(true);
  });

  it('uma mensagem com conteúdo na rodada desliga a regra', () => {
    expect(rodadaSoDeConfirmacao([INSTRUCAO, m('inbound', 'ok'), m('inbound', 'mas e se chover?')])).toBe(false);
  });

  it('primeira mensagem da conversa e histórico vazio nunca são confirmação', () => {
    expect(rodadaSoDeConfirmacao([m('inbound', 'bom dia')])).toBe(false);
    expect(rodadaSoDeConfirmacao([])).toBe(false);
    expect(rodadaSoDeConfirmacao([m('inbound', 'ok'), INSTRUCAO])).toBe(false);
  });
});

describe('blocoDaConfirmacaoCurta', () => {
  it('proíbe repetir, e manda dar o próximo passo quando a confirmação responde a uma oferta', () => {
    expect(blocoDaConfirmacaoCurta(false)).toBe('');
    const bloco = blocoDaConfirmacaoCurta(true);
    expect(bloco).toContain('PROIBIDO repetir');
    expect(bloco).toContain('PRÓXIMO passo');
  });
});
