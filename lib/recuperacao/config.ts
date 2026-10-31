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
    /**
     * O VALOR QUE CADA PASSO OFERECE a quem já ouviu o preço e ficou em silêncio, na mesma ordem de
     * `steps_minutes` (`null` = o passo só retoma a conversa). O valor tem de ser um degrau da escada de preço
     * do agente: é por ele que o turno seguinte sabe cobrar. Ausente = nenhum passo oferece valor.
     */
    step_offers_cents: z.array(z.number().int().positive().nullable()).max(MAXIMO_DE_PASSOS).optional(),
    /**
     * O PASSO PERGUNTA QUANTO CABE HOJE a quem ouviu o preço e calou, na mesma ordem de `steps_minutes`. Pedido do dono
     * em 31/10/2026: quando o Pix vence (1 h), em vez de repetir "conseguiu copiar o código?", a agente pergunta quanto
     * cabe — e o valor que a pessoa disser vira entrada, com o restante numa data (`entradaImediata`). Um passo com
     * valor em `step_offers_cents` oferece o valor; este vale só para o passo sem valor. Ausente = nenhum pergunta.
     */
    step_asks_amount: z.array(z.boolean()).max(MAXIMO_DE_PASSOS).optional(),
  })
  .strict()
  .refine((r) => (r.step_offers_cents?.length ?? 0) <= r.steps_minutes.length, {
    path: ["step_offers_cents"],
    message: "recovery_offers_exceed_steps",
  })
  .refine((r) => (r.step_asks_amount?.length ?? 0) <= r.steps_minutes.length, {
    path: ["step_asks_amount"],
    message: "recovery_asks_exceed_steps",
  })
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
/** O valor que o passo `passo` (a partir de 1) oferece, ou `null`. */
export function ofertaDoPasso(r: Pick<Recuperacao, "step_offers_cents"> | null, passo: number): number | null {
  return r?.step_offers_cents?.[passo - 1] ?? null;
}

/** O passo `passo` (a partir de 1) pergunta quanto cabe hoje: marcado, e sem valor próprio para oferecer. */
export function perguntaQuantoCabeNoPasso(r: Pick<Recuperacao, "step_offers_cents" | "step_asks_amount"> | null, passo: number): boolean {
  return r?.step_asks_amount?.[passo - 1] === true && ofertaDoPasso(r, passo) === null;
}

export function lerRecuperacao(followup: unknown): Recuperacao | null {
  if (typeof followup !== "object" || followup === null) return null;
  const lida = recuperacaoSchema.safeParse((followup as { recovery?: unknown }).recovery);
  return lida.success && lida.data.enabled ? lida.data : null;
}
