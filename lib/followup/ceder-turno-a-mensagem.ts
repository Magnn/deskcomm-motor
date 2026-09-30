/**
 * UMA VOZ SÓ quando a mensagem dispara um fluxo de «mensagem recebida».
 *
 * O drain do agente (`ai_agent.dispatch_requested` → `inbound_turn`) acorda no
 * MESMO inbound que o gatilho `inbound_message`. Sem este skip, a pessoa recebe a
 * mensagem do fluxo E a resposta do LLM.
 *
 * A pergunta é respondida pelo FATO, não por recálculo: o produtor
 * (`gatilho-mensagem.ts`) roda antes do drain e grava `enrolled_by_inbound_message`
 * com o `message_id`. Se o evento existe, o fluxo já é a voz desta mensagem — e
 * não há segunda regra de casamento para divergir da primeira.
 *
 * Fail-open: consulta que falha não cala o agente. Deixar a pessoa sem ninguém é
 * pior do que duas vozes pontuais.
 */
import type pg from "pg";

import { EVENTO_DE_INSCRICAO_POR_MENSAGEM } from "./gatilho-mensagem";

export interface PedidoDeCessaoPorMensagem {
  organizationId: string;
  contactId: string;
  messageId: string;
}

/** `true` = não enfileirar `inbound_turn`; o fluxo disparado pela mensagem fala. */
export async function deveCederTurnoAMensagem(
  pool: Pick<pg.Pool, "query">,
  pedido: PedidoDeCessaoPorMensagem,
): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `select 1 from followup_enrollments e
         join followup_enrollment_events ev
           on ev.organization_id = e.organization_id and ev.enrollment_id = e.id
        where e.organization_id = $1 and e.contact_id = $2
          and ev.event_type = $4
          and ev.payload->>'message_id' = $3
        limit 1`,
      [pedido.organizationId, pedido.contactId, pedido.messageId, EVENTO_DE_INSCRICAO_POR_MENSAGEM],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
