import { describe, expect, it } from 'vitest';
import type { ToolSet } from '../edge/llm/run-model-call';
import { comRecusaDoEnvioMarcada } from './veto-da-ferramenta-de-envio';

describe('recusa da ferramenta de envio marca o turno (Obede, 20/11/2026)', () => {
  it('a recusa por valor errado chega a quem marca o veto; o resultado volta igual ao modelo', async () => {
    const marcados: string[] = [];
    const recusa = { ok: false, error: { code: 'valor_do_extra_errado', message: 'x' } };
    const tools = comRecusaDoEnvioMarcada({ send_message: { execute: async () => recusa } } as unknown as ToolSet, (c) => marcados.push(c));
    const exec = (tools.send_message as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute;
    expect(await exec({}, {})).toBe(recusa);
    expect(marcados).toEqual(['valor_do_extra_errado']);
  });
  it('envio que saiu não marca nada', async () => {
    const marcados: string[] = [];
    const tools = comRecusaDoEnvioMarcada({ send_message: { execute: async () => ({ ok: true }) } } as unknown as ToolSet, (c) => marcados.push(c));
    await (tools.send_message as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute({}, {});
    expect(marcados).toEqual([]);
  });
});
