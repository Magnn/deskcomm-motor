import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PUT    /api/v1/ai/agents/:id/ad-briefs/:briefId (admin) — substitui o brief inteiro.
 * DELETE /api/v1/ai/agents/:id/ad-briefs/:briefId (admin) — apaga o brief.
 *
 * Apaga de verdade (não é "arquivar"): um brief de anúncio é configuração pura, sem histórico que
 * precise sobreviver — diferente de uma inscrição ou um evento. Ver `route.ts` (GET/POST da lista).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { adBriefInputSchema } from "@/lib/consciencia/ad-briefs";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string; briefId: string }> };

export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id, briefId } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(briefId)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = adBriefInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_agent_ad_briefs")
    .update(parsed.data)
    .eq("id", briefId)
    .eq("agent_id", id)
    .eq("organization_id", org.orgId)
    .select("id, rotulo, ad_id, titulo_contem, nivel, desejo_ou_dor, medo_oculto, promessa, ativo, created_at, updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return fail(
        "state_conflict",
        t("Já existe um brief ativo para este ID de anúncio neste agente. Desative o outro antes, ou edite-o."),
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao salvar o brief de anúncio.", 500, { requestId });
  }
  if (!data) return fail("not_found", t("Brief não encontrado."), 404, { requestId });

  await audit({
    action: "ai.ad_brief_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    metadata: { brief_id: briefId, nivel: data.nivel, ativo: data.ativo },
  });

  return ok({ ad_brief: data }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id, briefId } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(briefId)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_agent_ad_briefs")
    .delete()
    .eq("id", briefId)
    .eq("agent_id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao apagar o brief de anúncio.", 500, { requestId });
  if (!data) return fail("not_found", t("Brief não encontrado."), 404, { requestId });

  await audit({
    action: "ai.ad_brief_deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    metadata: { brief_id: briefId },
  });

  return ok({ deleted: true }, { requestId });
}
