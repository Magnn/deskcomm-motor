/**
 * UM DONO POR VEZ nas mensagens que o agente manda sozinho.
 *
 * Três rotinas falam com quem está calado: a recuperação de silêncio (régua de passos), a oferta proativa
 * (uma por dia) e o retorno agendado pelo próprio agente (`schedule_followup`). Cada uma decidia sozinha, e
 * medido em 22/11/2026 (3 dias, Cigana): cerca de 80 pessoas receberam mensagens de DUAS rotinas diferentes em
 * menos de 6 h, sem responder no meio — sobretudo a régua correndo atrás de uma oferta (32) e o retorno saindo
 * logo depois da régua (39).
 *
 * As regras, uma por fonte:
 *   - a RÉGUA não persegue mensagem que não foi resposta: se a oferta proativa ou um retorno agendado falou
 *     depois da última mensagem da pessoa, a régua daquela âncora não anda;
 *   - o RETORNO agendado não sai em cima de outra automática: se a régua ou a oferta falou depois da última
 *     mensagem da pessoa, nas últimas `JANELA_ENTRE_AUTOMATICAS_HORAS`, o retorno é descartado;
 *   - a OFERTA já não sai para quem recebeu mensagem do agente sem responder (`oferta-proativa.ts`).
 *
 * Quem a pessoa responde zera tudo: a âncora é sempre a última mensagem dela.
 */
import type pg from "pg";

export const JANELA_ENTRE_AUTOMATICAS_HORAS = 6;

/** A fonte de um `followup_turn`, pela chave que cada rotina grava no payload. */
export type FonteAutomatica = "recuperacao" | "oferta" | "retorno";

export const CHAVE_DA_FONTE: Record<FonteAutomatica, string> = {
  recuperacao: "recovery",
  oferta: "oferta_proativa",
  retorno: "promise",
};

/**
 * Fragmento SQL para a consulta da régua: nenhuma oferta proativa nem retorno agendado foi executado para o
 * contato depois de `ancora` (a última mensagem da pessoa). `v` é a conversa.
 */
export function sqlReguaSemAutomaticaAlheia(ancora: string): string {
  return `not exists (
      select 1 from job_queue qa
      where qa.organization_id = v.organization_id and qa.contact_id = v.contact_id
        and qa.kind = 'followup_turn' and qa.status = 'done'
        and (qa.payload ? '${CHAVE_DA_FONTE.oferta}' or qa.payload ? '${CHAVE_DA_FONTE.retorno}')
        and qa.created_at > ${ancora})`;
}

export const CONSULTA_DE_OUTRA_AUTOMATICA = `
  select exists (
    select 1 from job_queue q
    where q.organization_id = $1 and q.contact_id = $2 and q.id <> $3
      and q.kind = 'followup_turn' and q.status = 'done'
      and (q.payload ? $4 or q.payload ? $5)
      and q.created_at > now() - make_interval(hours => $6::int)
      and q.created_at > coalesce((
        select max(m.created_at) from messages m
        where m.organization_id = $1 and m.conversation_id = $7 and m.direction = 'inbound'), '-infinity'::timestamptz)
      and exists (
        select 1 from messages mo
        where mo.organization_id = $1 and mo.conversation_id = $7 and mo.direction = 'outbound'
          and mo.created_at >= q.created_at)
  ) as ha`;

/**
 * O retorno agendado deve calar? Sim quando a régua ou a oferta já falou com a pessoa depois da última
 * mensagem dela, nas últimas horas. Só conta rotina que de fato mandou algo (há mensagem do agente depois dela).
 */
export async function retornoCaiEmCimaDeOutra(
  pool: Pick<pg.Pool, "query">,
  p: { organizationId: string; contactId: string; conversationId: string; jobId: string },
): Promise<boolean> {
  const { rows } = await pool.query<{ ha: boolean }>(CONSULTA_DE_OUTRA_AUTOMATICA, [
    p.organizationId,
    p.contactId,
    p.jobId,
    CHAVE_DA_FONTE.recuperacao,
    CHAVE_DA_FONTE.oferta,
    JANELA_ENTRE_AUTOMATICAS_HORAS,
    p.conversationId,
  ]);
  return rows[0]?.ha === true;
}
