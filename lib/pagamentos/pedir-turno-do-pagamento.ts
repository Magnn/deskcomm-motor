/**
 * Quem acabou de pagar não pode esperar escrever de novo para ser atendido: pede um turno da agente sobre a última
 * mensagem da pessoa, o mesmo pedido que o resgate do lead sem resposta emite.
 *
 * `fato_novo` é obrigatório: a última mensagem quase sempre já foi respondida (com a cobrança), e sem ele o turno é pulado.
 * ⚠️ `admin` é service-role: a organização vem de quem chama, nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function pedirTurnoDoPagamento(
  admin: SupabaseClient,
  e: { organizationId: string; conversaId: string; contatoId: string; fonte: string },
): Promise<void> {
  const { data: ultima } = await admin
    .from("messages")
    .select("id, channel_session_id")
    .eq("organization_id", e.organizationId)
    .eq("conversation_id", e.conversaId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const m = ultima as { id: string; channel_session_id: string | null } | null;
  if (!m) return;
  await admin.rpc("emit_event", {
    p_event_type: "ai_agent.dispatch_requested",
    p_entity_kind: "message",
    p_entity_id: m.id,
    p_payload: {
      organization_id: e.organizationId,
      conversation_id: e.conversaId,
      contact_id: e.contatoId,
      channel_session_id: m.channel_session_id,
      inbound_message_id: m.id,
      fato_novo: e.fonte,
    },
    p_metadata: { source: e.fonte },
    p_organization_id: e.organizationId,
  });
}
