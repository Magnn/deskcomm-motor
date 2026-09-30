import { describe, it, expect, vi } from 'vitest';

// Mesmo stub de followup-flow-classify.test.ts: env.ts valida process.env no
// import, e nenhum teste aqui faz uma chamada de modelo de verdade.
vi.mock('@/lib/env', () => ({ env: {} }));

const runModelCallMock = vi.fn();
vi.mock('../edge/llm/run-model-call', () => ({
  runModelCall: (...args: unknown[]) => runModelCallMock(...args),
}));

import { runGenericAiNode } from './followup-flow-generic-ai';

describe('runGenericAiNode', () => {
  const ids = { tenantId: 'org-1', leadId: 'lead-1', jobId: 'job-1' };
  const context = { contact: {}, messages: [] } as unknown as Parameters<typeof runGenericAiNode>[3]['context'];
  const deps = { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } } as unknown as Parameters<
    typeof runGenericAiNode
  >[4];

  it('chama o seam com o ponto followup_generic_ai — nunca outro purpose', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'texto do modelo' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'Diga oi', context }, deps);
    // .at(-1): os testes deste arquivo não resetam o mock entre si (cada um só
    // enfileira um retorno com mockResolvedValueOnce), então a CHAMADA MAIS
    // RECENTE é a desta rodada — `calls[0]` pegaria a 1ª chamada de todo o
    // arquivo, que é a mesma coisa só no primeiro teste.
    const chamada = runModelCallMock.mock.calls.at(-1)![2] as { purpose: string };
    expect(chamada.purpose).toBe('followup_generic_ai');
  });

  it('devolve o texto do modelo aparado', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: '  olá, tudo certo  ' }, model: 'x' });
    const texto = await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context }, deps);
    expect(texto).toBe('olá, tudo certo');
  });

  it('trunca em 4000 caracteres — teto de segurança pro campo de destino', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'x'.repeat(5000) }, model: 'x' });
    const texto = await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context }, deps);
    expect(texto).toHaveLength(4000);
  });

  it('lança em resposta vazia — nunca grava string vazia (o job re-tenta pela fila)', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: '   ' }, model: 'x' });
    await expect(runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context }, deps)).rejects.toThrow();
  });

  it('a instrução leva o prompt do fluxo e o contexto do lead — nenhum dos dois se perde', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'Instrução única', context }, deps);
    const chamada = runModelCallMock.mock.calls.at(-1)![2] as { messages: Array<{ content: string }> };
    expect(chamada.messages[0]!.content).toContain('Instrução única');
    expect(chamada.messages[0]!.content).toContain(JSON.stringify(context));
  });

  it('repassa ao seam o modelo, a temperatura e o teto de tokens escolhidos no nó', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context, model: 'gpt-4o', temperature: 0.7, maxOutputTokens: 300 }, deps);
    const chamada = runModelCallMock.mock.calls.at(-1)![2] as { model?: string; temperature?: number; maxOutputTokens?: number };
    expect(chamada).toMatchObject({ model: 'gpt-4o', temperature: 0.7, maxOutputTokens: 300 });
  });

  it('sem opções, NÃO manda modelo, temperatura nem teto (vale o padrão da organização)', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context }, deps);
    const chamada = runModelCallMock.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(chamada).not.toHaveProperty('model');
    expect(chamada).not.toHaveProperty('temperature');
    expect(chamada).not.toHaveProperty('maxOutputTokens');
  });

  it('personalidade, restrições e base de informações entram como seções da instrução', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, {
      prompt: 'Responda',
      context,
      blocos: { identidade: '- Você é Suzana.', limites: '- Nunca prometa cura.', conhecimento: ['O ritual dura 7 dias.'] },
    }, deps);
    const c = (runModelCallMock.mock.calls.at(-1)![2] as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(c).toContain('## Identidade e tom');
    expect(c).toContain('Você é Suzana.');
    expect(c).toContain('## Restrições');
    expect(c).toContain('Nunca prometa cura.');
    expect(c).toContain('## Base de informações');
    expect(c).toContain('[1] O ritual dura 7 dias.');
  });

  it('sem blocos, nenhuma dessas seções aparece', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context }, deps);
    const c = (runModelCallMock.mock.calls.at(-1)![2] as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(c).not.toContain('## Identidade');
    expect(c).not.toContain('## Restrições');
    expect(c).not.toContain('## Base de informações');
  });

  it('quando o texto vai ao cliente, a instrução deixa de dizer que é um campo interno', async () => {
    runModelCallMock.mockResolvedValueOnce({ result: { text: 'ok' }, model: 'x' });
    await runGenericAiNode({} as never, {} as never, ids, { prompt: 'p', context, paraCliente: true }, deps);
    const c = (runModelCallMock.mock.calls.at(-1)![2] as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(c).toContain('ENVIADO ao cliente');
    expect(c).not.toContain('campo interno');
  });
});
