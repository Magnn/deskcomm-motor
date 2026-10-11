import { describe, expect, it } from 'vitest';

import { chaveDoBalao, semBaloesJaEnviados } from './balao-ja-enviado';

const A = 'É exatamente por isso que tudo o que você tentou até hoje não funcionou. Segurar o choro não mexe na raiz.';
const B = 'O que as cartas mostram no meio desse caminho é um nó de silêncio e orgulho, e ele está na raiz.';
const NOVO = 'Ficou alguma dúvida sobre o que as três cartas mostraram pra você, meu bem? Me conta com calma.';

describe('semBaloesJaEnviados', () => {
  it('⭐ a retomada que refaz a etapa inteira não sai: tudo já foi enviado', () => {
    const r = semBaloesJaEnviados(`${A}\n\n${B}`, [A, B]);
    expect(r).toEqual({ corpo: '', retirados: 2 });
  });

  it('balão repetido sai e o novo segue', () => {
    const r = semBaloesJaEnviados(`${A}\n\n${NOVO}`, [A]);
    expect(r).toEqual({ corpo: NOVO, retirados: 1 });
  });

  it('⭐ o mesmo balão duas vezes dentro da mesma resposta sai uma vez só', () => {
    const r = semBaloesJaEnviados(`${A}\n\n${NOVO}\n\n${A}`, []);
    expect(r).toEqual({ corpo: `${A}\n\n${NOVO}`, retirados: 1 });
  });

  it('diferença só de acento, maiúscula ou pontuação ainda é o mesmo balão', () => {
    const r = semBaloesJaEnviados(A.toUpperCase().replace(/\./g, '!'), [A]);
    expect(r.retirados).toBe(1);
    expect(chaveDoBalao('Olá,  MEU bem!')).toBe('ola meu bem');
  });

  it('frase curta e link nunca são barrados: repetir "sim" ou reenviar o link é conversa normal', () => {
    const link = 'https://pay.exemplo.com/abc_1132655?utm_source=whatsapp&cliente=um-parametro-bem-comprido-mesmo';
    const r = semBaloesJaEnviados(`Conseguiu abrir o link?\n\n${link}`, ['Conseguiu abrir o link?', link]);
    expect(r).toEqual({ corpo: `Conseguiu abrir o link?\n\n${link}`, retirados: 0 });
  });

  it('mensagem anterior com vários balões é comparada balão a balão', () => {
    const r = semBaloesJaEnviados(B, [`${A}\n\n${B}`]);
    expect(r).toEqual({ corpo: '', retirados: 1 });
  });

  it('sem histórico, o corpo segue igual', () => {
    expect(semBaloesJaEnviados(`${A}\n\n${B}`, [])).toEqual({ corpo: `${A}\n\n${B}`, retirados: 0 });
  });
});
