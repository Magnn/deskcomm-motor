import { describe, expect, it } from 'vitest';

import { declaraGanho, ganhoSemProvaDePagamento } from './ganho-exige-pagamento';

describe('ganhoSemProvaDePagamento', () => {
  it('⭐ agente que vende por checkout não fecha como ganho quem não tem a marca de pago', () => {
    expect(ganhoSemProvaDePagamento({ raw: { stage: 'won' }, vendePorCheckout: true, tagsDoContato: [] })).toBe(true);
    expect(ganhoSemProvaDePagamento({ raw: { stage: 'won' }, vendePorCheckout: true, tagsDoContato: ['anuncio'] })).toBe(true);
  });

  it('com a marca de pago (checkout ou registro da equipe), o ganho passa', () => {
    expect(ganhoSemProvaDePagamento({ raw: { stage: 'won' }, vendePorCheckout: true, tagsDoContato: ['pago'] })).toBe(false);
  });

  it('agente sem preço configurado não muda: ganho declarado continua valendo', () => {
    expect(ganhoSemProvaDePagamento({ raw: { stage: 'won' }, vendePorCheckout: false, tagsDoContato: [] })).toBe(false);
  });

  it('os outros passos nunca são barrados', () => {
    for (const stage of ['new', 'contacted', 'qualifying', 'qualified', 'negotiating', 'lost']) {
      expect(ganhoSemProvaDePagamento({ raw: { stage }, vendePorCheckout: true, tagsDoContato: [] })).toBe(false);
    }
    expect(ganhoSemProvaDePagamento({ raw: { next_action: 'x' }, vendePorCheckout: true, tagsDoContato: [] })).toBe(false);
    expect(declaraGanho(null)).toBe(false);
    expect(declaraGanho('won')).toBe(false);
  });
});
