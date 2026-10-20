/**
 * O FLUXO NO COMANDO: enquanto um fluxo conduz a conversa, a agente de IA não fala por cima dele.
 *
 * Decisão do dono em 20/10/2026 ("isole o agente de IA do fluxo, pra ela não se intrometer no atendimento do
 * fluxo"). Antes, a trava existia só para fluxo de palavra-chave e de primeiro contato (`pos-entrada.ts`) e
 * para o gatilho "cliente voltou" (`ceder-turno-ao-retorno.ts`); um fluxo de qualquer outro gatilho deixava o
 * turno da agente responder a mesma mensagem que o fluxo consumia, e a régua de silêncio mandava lembrete a quem
 * estava parado numa pergunta do funil. Esta é a regra única, e quem a consulta é todo caminho em que a agente
 * fala sozinha: o turno da mensagem recebida (`drain.ts`), a régua de silêncio e o resgate de lead sem resposta.
 *
 * ─── O que é "conduzindo" ─────────────────────────────────────────────────────────────────────────────────
 *   • `waiting_reply`: o fluxo fez uma pergunta, e a resposta da pessoa é DELE — sempre, por
 *     mais antiga que seja a pergunta (a resposta cai no nó e o fluxo segue de onde parou).
 *   • `active` com o próximo passo dentro de 1 dia: o fluxo está no meio de uma sequência.
 *
 * ─── O que NÃO é ──────────────────────────────────────────────────────────────────────────────────────────
 *   • `com_agente` e `coletando`: o nó "Agente de IA" e o roteiro de atendimento — os dois são conduzidos PELO
 *     turno da agente, por desenho (`agente-no-fluxo.ts`, `atendimento.ts`).
 *   • `active` estacionado (o próximo passo só daqui a dias, ex.: um "espera 7 dias"): o fluxo não está
 *     conversando, e a pessoa que escreve no meio dessa espera precisa de alguém. Calar a agente aí deixaria
 *     a pessoa sem resposta por dias.
 *   • Inscrição de fluxo DESATIVADO (ponteiro fora de `active`): fluxo desligado para de guiar na hora.
 *   • Pausas (`paused_handoff`, `paused_manual`): quem responde ali é a pessoa da equipe, e o turno já tem as
 *     guardas de humano no comando.
 *
 * Fail-open: falha na consulta = `false` (a agente segue). Calar na dúvida deixa a pessoa sem ninguém.
 */
import type pg from "pg";

/**
 * O predicado em SQL, para as consultas em lote (régua de silêncio, resgate). `$org`/`$contato` são as
 * EXPRESSÕES da consulta que o embute (ex.: `v.organization_id`, `v.contact_id`), nunca valores do usuário.
 */
export function sqlFluxoNoComando(org: string, contato: string): string {
  return `exists (
      select 1 from followup_enrollments fe
      join followup_flow_pointers fep on fep.id = fe.pointer_id and fep.organization_id = fe.organization_id
      where fe.organization_id = ${org} and fe.contact_id = ${contato}
        and fep.status = 'active'
        and (fe.status = 'waiting_reply'
             or (fe.status = 'active' and (fe.next_eval_at is null or fe.next_eval_at < now() + interval '1 day'))))`;
}

export async function fluxoNoComando(
  pool: Pick<pg.Pool, "query">,
  organizationId: string,
  contactId: string,
): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ conduzindo: boolean }>(
      `select ${sqlFluxoNoComando("$1::uuid", "$2::uuid")} as conduzindo`,
      [organizationId, contactId],
    );
    return rows[0]?.conduzindo === true;
  } catch {
    return false;
  }
}
