import { describe, expect, it, vi } from 'vitest';

import { pricingSchema } from '@/lib/preco/tipos';

import { cobrancaPeloProvedorNoLugarDoLink } from './cobranca-pelo-provedor-no-envio';

const EXTERNO = 'https://pay.exemplo.com.br/c60';
const pricing = pricingSchema.parse({
  enabled: true,
  list_price_cents: 6000,
  list_product_links: [{ name: 'Abertura do Coração', url: EXTERNO }, { name: 'Caminhos', url: 'https://pay.exemplo.com.br/k60' }],
  steps: [{ price_cents: 5000, product_links: [{ name: 'Abertura do Coração', url: 'https://pay.exemplo.com.br/c50' }] }],
  pix_key: { key: '62.917.956/0001-00', holder: 'Empresa Exemplo' },
  provider_only_checkout: true,
});
const log = { info: vi.fn(), warn: vi.fn() };
const base = {
  pricing,
  organizationId: 'org',
  contactId: 'contato',
  conversationId: '11111111-2222-3333-4444-555555555555',
  supabase: {} as never,
  log,
  lerConexao: async () => ({ chave: 'sk_x' }) as never,
  agora: new Date('2026-10-12T19:00:00Z'),
};
const PIX = { id: 'pi_1', copiaECola: '00020101021226740014br.gov.bcb.pix2552exemplo' } as never;
const LINK = { id: 'plink_1', url: 'https://buy.provedor.com/abc' };
const corpo = `Fechado em R$ 60.\n\n${EXTERNO}\n\nConseguiu abrir?`;

describe('a cobrança sai só pelo provedor', () => {
  it('⭐ o link externo some: saem o Pix e o link de cartão do provedor, no valor do link', async () => {
    const criarPix = vi.fn(async (_c: unknown, _p: unknown) => PIX);
    const criarLink = vi.fn(async (_c: unknown, _p: unknown) => LINK);
    const r = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarPix, criarLink });
    if (!('corpo' in r)) throw new Error('esperava corpo');
    expect(r.corpo).not.toContain('pay.exemplo.com.br');
    expect(r.corpo).toContain('00020101021226740014');
    expect(r.corpo).toContain('https://buy.provedor.com/abc');
    expect(r.corpo).toContain('Fechado em R$ 60.');
    expect(r.corpo).toContain('Conseguiu abrir?');
    expect(criarPix.mock.calls[0]![1]).toMatchObject({ valorCentavos: 6000, metadados: { produto: 'Abertura do Coração' } });
    expect(criarLink.mock.calls[0]![1]).toMatchObject({ valorCentavos: 6000, moeda: 'BRL' });
  });

  it('o Pix falhou: sai só o cartão do provedor; o cartão falhou: sai só o Pix', async () => {
    const soCartao = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarPix: async () => { throw new Error('x'); }, criarLink: async () => LINK });
    expect('corpo' in soCartao && soCartao.corpo).toContain('https://buy.provedor.com/abc');
    expect('corpo' in soCartao && soCartao.corpo).not.toContain('pay.exemplo.com.br');
    const soPix = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarPix: async () => PIX, criarLink: async () => { throw new Error('x'); } });
    expect('corpo' in soPix && soPix.corpo).toContain('00020101021226740014');
    expect('corpo' in soPix && soPix.corpo).not.toContain('cartão');
  });

  it('⭐ último caso: os dois falharam e a chave da empresa entra com o valor embutido', async () => {
    const falha = async () => { throw new Error('fora do ar'); };
    const r = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarPix: falha, criarLink: falha });
    if (!('corpo' in r)) throw new Error('esperava corpo');
    expect(r.corpo).not.toContain('pay.exemplo.com.br');
    expect(r.corpo).toContain('Empresa Exemplo');
    expect(r.corpo).toMatch(/\n\n000201[^\n]*540560\.00/);
  });

  it('⭐ sem provedor funcionando e sem chave: o envio é recusado, o link externo não sai', async () => {
    const falha = async () => { throw new Error('fora do ar'); };
    const semChave = pricingSchema.parse({ ...pricing, pix_key: undefined });
    const r = await cobrancaPeloProvedorNoLugarDoLink({ ...base, pricing: semChave, corpo, criarPix: falha, criarLink: falha });
    expect('recusa' in r).toBe(true);
  });

  it('dois links na mesma mensagem: recusa; nenhum link: corpo intacto; sem provedor conectado: quem chama decide', async () => {
    const dois = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo: `${EXTERNO} ou https://pay.exemplo.com.br/c50` });
    expect('recusa' in dois).toBe(true);
    expect(await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo: 'Oi, tudo bem?' })).toEqual({ corpo: 'Oi, tudo bem?' });
    expect(await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, lerConexao: async () => null })).toEqual({ semProvedor: true });
  });
});
