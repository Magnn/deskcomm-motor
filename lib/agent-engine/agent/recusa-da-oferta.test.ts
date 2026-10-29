import { describe, expect, it } from 'vitest';

import { blocoDaRecusa, recusouNoTurno } from './recusa-da-oferta';

describe('recusa da oferta no turno', () => {
  it('⭐ o caso de 29/10/2026: recusa no meio de um relato longo segue a conversa com o bloco', () => {
    const pendentes = [
      'Estou querida estou super bem tranquilo graças a Deus',
      'eu estou lhe dizendo que não tenho mais interesse a fazer o trabalho o comportamento dele mudou',
    ];
    expect(recusouNoTurno(pendentes)).toBe(true);
    const bloco = blocoDaRecusa(true);
    expect(bloco).toMatch(/NÃO pediu para encerrar/);
    expect(bloco).toMatch(/PROIBIDO dizer que vai parar de mandar mensagens/);
  });

  it('sem recusa, sem bloco', () => {
    expect(recusouNoTurno(['quanto custa?', 'não tenho dinheiro agora'])).toBe(false);
    expect(blocoDaRecusa(false)).toBe('');
  });
});
