/**
 * O RITMO DA RESPOSTA — quanto tempo o agente leva para "digitar".
 *
 * ── O defeito que isto fecha ───────────────────────────────────────────────
 *
 * Medido em produção: a primeira mensagem saía em ~25 segundos (não é o problema), mas as bolhas
 * seguintes vinham a cada 2 segundos, qualquer que fosse o tamanho — uma resposta de 500
 * caracteres chegava inteira em 2 s, o equivalente a 137 caracteres por segundo. Ninguém digita
 * assim, e quem recebe percebe.
 *
 * A pausa ENTRE bolhas era só o piso anti-banimento (1,2 s + até 0,8 s). Aqui ela passa a poder
 * ser proporcional ao texto da PRÓXIMA bolha — o tempo de digitá-la —, e o teto da pausa antes
 * da primeira bolha sobe junto.
 *
 * ── Por que é escolha de quem configura ────────────────────────────────────
 *
 * Mais devagar parece mais gente e custa tempo: cada resposta ocupa o atendimento por mais
 * segundos, e quem está pronto para comprar espera mais. Não há um número certo para todo
 * negócio. `rapido` é o comportamento de sempre e é o padrão: nada muda para quem não escolher.
 *
 * Mora em `ai_agents.config.ritmo` e vale no PRÓXIMO turno, sem publicar versão.
 */
import { z } from "zod";

export const RITMOS = ["rapido", "natural", "calmo"] as const;
export type Ritmo = (typeof RITMOS)[number];

export const RITMO_PADRAO: Ritmo = "rapido";

export const ritmoSchema = z.object({ modo: z.enum(RITMOS) });
export type RitmoConfig = z.infer<typeof ritmoSchema>;

/** Leitura defensiva: `config` é jsonb livre, e shape estranho vira o padrão. */
export function lerRitmo(config: unknown): Ritmo {
  const lido = ritmoSchema.safeParse((config as { ritmo?: unknown } | null | undefined)?.ritmo);
  return lido.success ? lido.data.modo : RITMO_PADRAO;
}

export interface ParametrosDaPausa {
  /** A parcela que não depende do texto, em ms. */
  baseMs: number;
  /** ms por caractere do texto que vai sair. */
  msPorCaractere: number;
  /** Teto: acima disto o silêncio lê como queda, não como digitação. */
  maximoMs: number;
}

/**
 * Antes da PRIMEIRA bolha. `rapido` são os números de sempre de `atraso-humano.ts`.
 *
 * Mesmo o `calmo` fica bem acima da digitação real (um bom digitador faz ~8 caracteres/s no
 * celular; 55 ms/caractere são 18): o objetivo é "não é instantâneo", e não fazer a pessoa
 * esperar um minuto por um parágrafo.
 */
export const PAUSA_ANTES_DA_PRIMEIRA: Record<Ritmo, ParametrosDaPausa> = {
  rapido: { baseMs: 900, msPorCaractere: 22, maximoMs: 7_500 },
  natural: { baseMs: 1_500, msPorCaractere: 35, maximoMs: 12_000 },
  calmo: { baseMs: 2_500, msPorCaractere: 55, maximoMs: 20_000 },
};

/** ENTRE bolhas. `null` = só o piso anti-banimento de sempre, sem proporção ao texto. */
export const PAUSA_ENTRE_BOLHAS: Record<Ritmo, ParametrosDaPausa | null> = {
  rapido: null,
  natural: { baseMs: 1_500, msPorCaractere: 45, maximoMs: 9_000 },
  calmo: { baseMs: 2_500, msPorCaractere: 70, maximoMs: 15_000 },
};

/** O piso anti-banimento do canal (CLAUDE.md: 1 mensagem a cada 1,2 s). Nenhuma pausa fica abaixo dele. */
export const PISO_ENTRE_BOLHAS_MS = 1_200;
const FOLGA_DO_PISO_MS = 800;

/**
 * Quanto esperar antes de mandar `proximaBolha`, em ms. Pura — `aleatorio` é injetado.
 *
 * No `rapido` é exatamente o que era: 1,2 s + até 0,8 s. Nos outros, o tempo de "digitar" a
 * bolha, com uma variação de ±15% (pausa idêntica entre todas as bolhas também denuncia), e
 * nunca abaixo do piso.
 */
export function pausaEntreBolhas(ritmo: Ritmo, proximaBolha: string, aleatorio: () => number = Math.random): number {
  const p = PAUSA_ENTRE_BOLHAS[ritmo];
  if (p === null) return PISO_ENTRE_BOLHAS_MS + Math.floor(aleatorio() * FOLGA_DO_PISO_MS);
  const bruto = Math.min(p.maximoMs, p.baseMs + p.msPorCaractere * (proximaBolha ?? "").trim().length);
  const variado = Math.round(bruto * (0.85 + aleatorio() * 0.3));
  return Math.max(PISO_ENTRE_BOLHAS_MS, Math.min(p.maximoMs, variado));
}

/** O "digitando…" aparece entre as bolhas? Só quando a pausa é longa o bastante para ser vista. */
export function sinalizaDigitandoEntreBolhas(ritmo: Ritmo): boolean {
  return PAUSA_ENTRE_BOLHAS[ritmo] !== null;
}
