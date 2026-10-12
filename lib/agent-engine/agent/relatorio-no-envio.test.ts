import { describe, expect, it, vi } from 'vitest';

import { blocoDosExtras } from '@/lib/preco/extras';
import { LEGENDA_DO_RELATORIO } from '@/lib/preco/relatorio-pronto';
import type { Extra } from '@/lib/preco/tipos';

import { relatorioNoLugarDaMarca } from './relatorio-no-envio';

const SINASTRIA: Extra = { name: 'Sinastria Amorosa', price_cents: 3700, when: 'Quando ela pedir a sinastria.', report: { kind: 'sinastria', title: 'O Código da Conexão' } };
const PERGUNTA: Extra = { name: 'Pergunta nova', price_cents: 500, when: 'Quando ela fizer outra pergunta.' };
const log = { info: vi.fn(), warn: vi.fn() };
const MARCA = '[[RELATORIO: Sinastria Amorosa | Marilene | 04/02/1982 | Donizete | 01/02/1980]]';
const corpo = `Recebi tudo, Marilene. Me dá um minutinho.\n\n${MARCA}\n\nAbre com calma.`;
const gerar = vi.fn(async (_p: { contexto: string }, _deps: unknown) => ({ ok: true as const, pdf: Buffer.from('%PDF-x'), conteudo: { capitulos: [1, 2, 3] } as never, nomeDoArquivo: 'O_Codigo_Marilene_Donizete.pdf' }));
const base = {
  corpo,
  extras: [SINASTRIA, PERGUNTA],
  pagos: [{ slug: 'sinastria-amorosa', hora: '14:29', minutosAtras: 5 }],
  mensagens: [{ direction: 'inbound', body: 'a gente se afasta e eu não entendo' }],
  assinatura: 'Atendente',
  organizationId: 'org',
  conversationId: 'conv',
  jobId: 'job',
  log,
  chamar: async () => '{}',
  gerar,
  guardar: async () => true,
};

describe('o relatório sob medida no envio', () => {
  it('⭐ extra pago + dados completos: a marca some e o PDF fica pronto para sair como arquivo', async () => {
    const r = await relatorioNoLugarDaMarca(base);
    if ('recusa' in r) throw new Error(r.recusa);
    expect(r.corpo).toBe('Recebi tudo, Marilene. Me dá um minutinho.\n\nAbre com calma.');
    expect(r.documento).toEqual({ storagePath: 'org/conv/relatorio-job/O_Codigo_Marilene_Donizete.pdf', mime: 'application/pdf', legenda: `${LEGENDA_DO_RELATORIO} O Código da Conexão` });
    expect(gerar.mock.calls[0]![0]).toMatchObject({ tipo: 'sinastria', produto: 'O Código da Conexão', a: { nome: 'Marilene', data: '1982-02-04' }, b: { nome: 'Donizete', data: '1980-02-01' } });
    expect((gerar.mock.calls[0]![0] as { contexto: string }).contexto).toContain('a gente se afasta');
  });

  it('⭐ sem pagamento, o relatório não é gerado', async () => {
    const r = await relatorioNoLugarDaMarca({ ...base, pagos: [] });
    expect('recusa' in r && r.recusa).toContain('ainda não foi pago');
  });

  it('⭐ o caso medido: data digitada errada (1082) volta como pedido de correção, sem gerar', async () => {
    gerar.mockClear();
    const r = await relatorioNoLugarDaMarca({ ...base, corpo: corpo.replace('04/02/1982', '04/02/1082') });
    expect('recusa' in r && r.recusa).toContain('não é uma data válida');
    expect(gerar).not.toHaveBeenCalled();
  });

  it('já entregue nesta conversa: não gera de novo', async () => {
    const r = await relatorioNoLugarDaMarca({ ...base, mensagens: [...base.mensagens, { direction: 'outbound', body: `${LEGENDA_DO_RELATORIO} O Código da Conexão` }] });
    expect('recusa' in r && r.recusa).toContain('já foi enviado');
  });

  it('geração ou gravação que falha recusa o envio; produto sem relatório também; sem marca nada muda', async () => {
    const falhou = await relatorioNoLugarDaMarca({ ...base, gerar: async () => ({ ok: false as const, motivo: 'x' }) });
    expect('recusa' in falhou && falhou.recusa).toContain('não pôde ser gerado');
    const semDisco = await relatorioNoLugarDaMarca({ ...base, guardar: async () => false });
    expect('recusa' in semDisco).toBe(true);
    const outro = await relatorioNoLugarDaMarca({ ...base, corpo: '[[RELATORIO: Pergunta nova | Ana | algo]]' });
    expect('recusa' in outro && outro.recusa).toContain('não tem relatório cadastrado');
    expect(await relatorioNoLugarDaMarca({ ...base, corpo: 'oi' })).toEqual({ corpo: 'oi', documento: null });
  });

  it('o bloco do turno ensina a marca a quem pagou', () => {
    const bloco = blocoDosExtras([SINASTRIA], [{ slug: 'sinastria-amorosa', hora: '14:29', minutosAtras: 3 }]);
    expect(bloco).toContain('[[RELATORIO: Sinastria Amorosa | nome dela | DD/MM/AAAA | nome da outra pessoa | DD/MM/AAAA]]');
    expect(bloco).toContain('o SISTEMA gera e envia');
  });
});
