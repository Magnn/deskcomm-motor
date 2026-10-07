/**
 * RECUPERAÇÃO DE SILÊNCIO — a configuração, num lugar só.
 *
 * O cliente para de responder no meio da conversa. Quem atende bem volta a chamar: logo em seguida,
 * um pouco depois, e mais uma vez antes de o dia acabar. Aqui isso é DADO do agente (`followup.recovery`
 * na versão publicada), não fluxo desenhado caixa a caixa: alguns números e dois interruptores.
 *
 * ─── As duas partes ───────────────────────────────────────────────────────────────────────────────
 *   `steps_minutes` — quanto tempo de silêncio, contado da última fala do agente, dispara cada chamada.
 *                     Padrão 1 h e 20 h: uma chamada depois de uma hora e uma última antes de as 24 h
 *                     do canal acabarem. A régua de 3 min, 15 min e 3 h, com volume de anúncio, é
 *                     insistência — quem só clicou por curiosidade bloqueia o número.
 *   `keep_window`   — para quem COMBINOU voltar numa data além das 24 horas que o canal oficial dá de
 *                     conversa livre: nas últimas horas antes de esse prazo acabar, o agente manda uma
 *                     mensagem que pede resposta. Se a pessoa responde, o prazo recomeça.
 *
 * Módulo folha (só zod): é lido pela validação da tela, pela própria tela e pelo worker.
 */
import { z } from "zod";

/** Teto de um passo: dentro das 24 h do canal oficial, com folga. */
export const PASSO_MAXIMO_MIN = 23 * 60;
export const MAXIMO_DE_PASSOS = 5;
export const HORAS_ANTES_MAXIMO = 12;

export const recuperacaoSchema = z
  .object({
    enabled: z.boolean(),
    steps_minutes: z.array(z.number().int().min(1).max(PASSO_MAXIMO_MIN)).min(1).max(MAXIMO_DE_PASSOS),
    keep_window: z
      .object({
        enabled: z.boolean(),
        hours_before_close: z.number().int().min(1).max(HORAS_ANTES_MAXIMO),
      })
      .strict(),
  })
  .strict()
  .refine((r) => r.steps_minutes.every((m, i) => i === 0 || m > (r.steps_minutes[i - 1] ?? 0)), {
    path: ["steps_minutes"],
    message: "recovery_steps_must_increase",
  });

export type Recuperacao = z.infer<typeof recuperacaoSchema>;

/** O que a tela propõe ao ligar: 1 h, 20 h, e a última janela 3 h antes de fechar. */
export const RECUPERACAO_PADRAO: Recuperacao = {
  enabled: true,
  steps_minutes: [60, 1200],
  keep_window: { enabled: true, hours_before_close: 3 },
};

/**
 * Lê `followup.recovery` da versão publicada. `null` = desligada, ausente (versão antiga) ou shape
 * inválido — nos três casos o agente NÃO chama ninguém: contato proativo só com configuração legível.
 */
export function lerRecuperacao(followup: unknown): Recuperacao | null {
  if (typeof followup !== "object" || followup === null) return null;
  const lida = recuperacaoSchema.safeParse((followup as { recovery?: unknown }).recovery);
  return lida.success && lida.data.enabled ? lida.data : null;
}
