import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/messages/:id/retranscrever (agent+) — pede de novo a transcrição de um áudio que falhou.
 *
 * A transcrição é feita pelo `media-derive-worker`, que desiste depois de 5 tentativas e grava
 * `media_derived_status = 'failed'`. A causa quase sempre passa (crédito do serviço de transcrição que
 * acabou e voltou, serviço fora do ar) — e, até aqui, o áudio ficava mudo para sempre: não havia como
 * pedir de novo sem mexer no banco. Medido em produção em 06/10/2026: 22 de 24 áudios recebidos em
 * `failed`, todos pelo mesmo motivo temporário.
 *
 * Só refaz o que FALHOU. Áudio já transcrito não é refeito (custaria de novo para o mesmo texto), e
 * áudio ainda em andamento não é enfileirado duas vezes.
 *
 * A mensagem é lida pelo client de SESSÃO: a RLS decide se o ator enxerga a conversa. A escrita do
 * estado e o evento usam o client admin, como o worker que normalmente os produz.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const supabase = await createClient();
  const { data: msg } = await supabase
    .from("messages")
    .select("id, organization_id, conversation_id, type, media_storage_path, media_derived_status")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!msg) return fail("not_found", t("Mensagem não encontrada."), 404, { requestId });
  if (msg.type !== "audio" || !msg.media_storage_path) {
    return fail("state_conflict", t("Esta mensagem não é um áudio guardado."), 409, { requestId });
  }
  if (msg.media_derived_status !== "failed") {
    return fail("state_conflict", t("Este áudio não está com a transcrição em falha."), 409, { requestId });
  }

  const admin = createAdminClient();
  // Volta para "em andamento" SÓ se ainda estiver em falha: dois cliques seguidos não enfileiram duas vezes.
  const { data: reaberta, error: erroDoEstado } = await admin
    .from("messages")
    .update({ media_derived_status: null, media_derived_text: null })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .eq("media_derived_status", "failed")
    .select("id")
    .maybeSingle();
  if (erroDoEstado) return fail("internal_error", "Erro ao reabrir a transcrição.", 500, { requestId });
  if (!reaberta) return fail("state_conflict", t("Este áudio não está com a transcrição em falha."), 409, { requestId });

  const { error: erroDoEvento } = await admin.rpc("emit_event" as never, {
    p_event_type: "media.derive_requested",
    p_entity_kind: "message",
    p_entity_id: id,
    p_payload: { message_id: id },
    p_metadata: { source: "retranscrever" },
    p_organization_id: org.orgId,
  } as never);
  if (erroDoEvento) {
    // Sem o evento ninguém transcreve: devolve o estado de falha para o botão continuar na tela.
    await admin
      .from("messages")
      .update({ media_derived_status: "failed" })
      .eq("id", id)
      .eq("organization_id", org.orgId);
    return fail("internal_error", "Erro ao pedir a transcrição de novo.", 500, { requestId });
  }

  await audit({
    action: "message.transcription_retried",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message",
    resourceId: id,
    requestId,
    metadata: { conversation_id: msg.conversation_id },
  });

  return ok({ id, media_derived_status: null }, { requestId });
}
