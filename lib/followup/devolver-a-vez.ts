/**
 * O FLUXO DEVOLVE A VEZ — quando uma inscrição termina e a ÚLTIMA palavra da conversa é da pessoa, a agente é
 * acordada para responder a essa mensagem, na hora.
 *
 * Medido em 20/10/2026: desde o isolamento do fluxo (`fluxo-no-comando.ts`), a mensagem que a pessoa manda enquanto
 * o fluxo espera a resposta dela é do FLUXO — o turno da agente é pulado. Quando o fluxo consome essa mensagem e
 * TERMINA nela (ex.: "Quer que eu te mande o pagamento?" → "agora não tenho dinheiro" → Fim), ninguém respondia:
 * o turno da agente já tinha sido pulado, e só o resgate de lead sem resposta (5 min depois) a acordava.
 *
 * A regra: a mensagem mais recente do contato é dele (inbound), não tem resposta nossa depois dela e chegou há no
 * máximo 30 min. Então o pedido de atendimento é reemitido para ela — o MESMO evento que o canal emite em cada
 * mensagem recebida e que o resgate reemite, e o mesmo caminho dali em diante (drain: anti-backlog, gate de
 * elegibilidade, humano no comando). Fluxo que termina com a ÚLTIMA palavra nossa (a cobrança, um lembrete
 * esgotado) não acorda ninguém.
 *
 * Best-effort: quem chama engole o erro (o fluxo já terminou); o resgate continua sendo a rede.
 */

/** Até quantos minutos depois da mensagem da pessoa o fim do fluxo ainda devolve a vez. */
export const JANELA_DA_DEVOLUCAO_MINUTOS = 30;

export const ORIGEM_DA_DEVOLUCAO = "fluxo_concluido";

/** `$1` = organização, `$2` = contato. Emite no máximo um evento; não devolve linhas quando não há o que devolver. */
export const SQL_DEVOLVER_A_VEZ = `
  with ultima as (
    select m.id, m.conversation_id, m.contact_id, m.channel_session_id, m.direction,
           coalesce(m.sent_at, m.created_at) as quando
      from messages m
     where m.organization_id = $1 and m.contact_id = $2
     order by coalesce(m.sent_at, m.created_at) desc, m.created_at desc
     limit 1
  )
  select emit_event('ai_agent.dispatch_requested', 'message', u.id,
           jsonb_build_object('organization_id', $1::uuid, 'conversation_id', u.conversation_id, 'contact_id', u.contact_id,
                              'channel_session_id', u.channel_session_id, 'inbound_message_id', u.id),
           jsonb_build_object('source', '${ORIGEM_DA_DEVOLUCAO}'), $1::uuid) as evento
    from ultima u
   where u.direction = 'inbound'
     and u.quando > now() - interval '${JANELA_DA_DEVOLUCAO_MINUTOS} minutes'`;
