import type { ToolSet } from '../edge/llm/run-model-call';

/**
 * As travas de preço e de link moram DENTRO da ferramenta `send_message` (antes da cadeia `before_send`) e devolvem
 * `{ ok: false, error: { code } }`. Sem esta marca, o turno em que todas as tentativas eram recusadas terminava mudo
 * e `ok` — em 20/11/2026 a pergunta de R$ 7 foi recusada 8 vezes, o breaker desligou o envio e o lead ficou sem
 * resposta. Marcado, o turno mudo é refeito pela fila como qualquer veto de conteúdo.
 */
export function comRecusaDoEnvioMarcada(tools: ToolSet, marcar: (code: string) => void): ToolSet {
  const envio = tools.send_message as { execute?: (input: unknown, options: unknown) => unknown } | undefined;
  if (!envio?.execute) return tools;
  const execute = envio.execute;
  return {
    ...tools,
    send_message: {
      ...envio,
      execute: async (input: unknown, options: unknown) => {
        const r = (await execute(input, options)) as { ok?: boolean; error?: { code?: unknown } } | undefined;
        if (r?.ok === false && typeof r.error?.code === 'string') marcar(r.error.code);
        return r;
      },
    },
  } as unknown as ToolSet;
}
