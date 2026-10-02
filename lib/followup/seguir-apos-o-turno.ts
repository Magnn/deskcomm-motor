/**
 * O RITMO DO FLUXO É O QUE O DONO CONFIGUROU — nem um minuto a mais.
 *
 * Quando o turno de uma caixa termina, a ponte (`turn-bridge.ts`) leva a
 * inscrição para a caixa seguinte com `next_eval_at = agora`. Quem a pegava era
 * o relógio de um minuto: entre uma caixa e a próxima entravam de 0 a 60 s que
 * ninguém configurou (medido em produção: caixa enviada às 00:05:37, a seguinte
 * só começou às 00:06:00). Num fluxo de cinco caixas, minutos de silêncio a mais.
 *
 * Aqui o worker, logo depois de fechar o turno, dá o próximo passo ele mesmo.
 * Só anda o que JÁ VENCEU: uma espera configurada (caixa Delay, "aguardar
 * resposta", janela de envio) tem `next_eval_at` no futuro e fica para o relógio,
 * como sempre. O Delay de dentro de uma caixa Conteúdo é pago pelo próprio
 * turno, antes de chegar aqui.
 *
 * É atalho, não fonte de verdade: qualquer falha vira log e o relógio assume —
 * o mesmo contrato de `lib/dev/kick-local-pipeline.ts`.
 */
import { avancarEnrollmentAtivo, type TickDeps } from "./engine";
import type { TurnBridgeAdminClient } from "./turn-bridge";

/** Teto de passos encadeados — condições e desvios em sequência, sem laço infinito. */
export const MAX_PASSOS_ENCADEADOS = 6;

export interface SeguirAposOTurnoDeps {
  db: TurnBridgeAdminClient;
  enqueueJob: TickDeps["enqueueJob"];
  clock?: () => Date;
  /** Injeção de teste; produção usa o passo real do motor. */
  avancar?: typeof avancarEnrollmentAtivo;
  log?: { warn: (msg: string, fields?: Record<string, unknown>) => void };
}

/**
 * Devolve quantos passos deu. `nodeIdConcluido` é a caixa cujo turno acabou de
 * fechar: se a inscrição ainda está nela, o turno não avançou (adiado, vetado,
 * estacionado) e não há o que seguir.
 */
export async function seguirAposOTurno(
  deps: SeguirAposOTurnoDeps,
  orgId: string,
  enrollmentId: string,
  nodeIdConcluido: string,
): Promise<number> {
  const clock = deps.clock ?? (() => new Date());
  const avancar = deps.avancar ?? avancarEnrollmentAtivo;
  let passos = 0;
  let ultimaPosicao: string | null = null;
  try {
    for (let i = 0; i < MAX_PASSOS_ENCADEADOS; i++) {
      const row = await deps.db.loadEnrollmentById(orgId, enrollmentId);
      if (!row || row.status !== "active") break;
      if (i === 0 && row.current_node_id === nodeIdConcluido) break;
      // Espera configurada (ou inscrição estacionada, sem data): é do relógio.
      if (row.next_eval_at === null || Date.parse(row.next_eval_at) > clock().getTime()) break;
      // Deu um passo e ficou no mesmo lugar (a caixa enfileirou o próprio turno):
      // o próximo movimento é desse turno, não deste laço.
      const posicao = `${row.current_node_id}:${row.steps_taken}`;
      if (posicao === ultimaPosicao) break;
      ultimaPosicao = posicao;
      await avancar({ db: deps.db, clock, enqueueJob: deps.enqueueJob }, row);
      passos++;
    }
  } catch (err) {
    deps.log?.warn("seguir para a próxima caixa falhou — o relógio de um minuto assume", {
      enrollment_id: enrollmentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return passos;
}
