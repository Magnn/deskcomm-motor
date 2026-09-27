import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/ai/agents/:id/ad-briefs (manager+) — a lista de briefs de anúncio do agente.
 * POST /api/v1/ai/agents/:id/ad-briefs (admin)    — cria um brief novo.
 *
 * Cada brief é um nível de consciência/desejo/medo/promessa por ANÚNCIO específico (`ad_id` exato ou
 * um trecho do título) — a exceção que vence o default da aba "Consciência" quando bate. Ver
 * `lib/consciencia/ad-briefs.ts` para a resolução usada no turno.
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

type Ctx = { params: Promise<{ id: string }> };

async function agenteDaOrg(admin: ReturnType<typeof createAdminClient>, id: string, orgId: string) {
  const { data } = await admin
    .from("ai_agents")
    .select("id, archived_at")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  const agente = await agenteDaOrg(admin, id, authz.org.orgId);
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });

  const { data, error } = await admin
    .from("ai_agent_ad_briefs")
    .select("id, rotulo, ad_id, titulo_contem, nivel, desejo_ou_dor, medo_oculto, promessa, ativo, created_at, updated_at")
    .eq("organization_id", authz.org.orgId)
    .eq("agent_id", id)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar os briefs de anúncio.", 500, { requestId });

  return ok({ ad_briefs: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

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
  const agente = await agenteDaOrg(admin, id, org.orgId);
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", "Agent arquivado.", 409, { requestId });

  const { data, error } = await admin
    .from("ai_agent_ad_briefs")
    .insert({
      organization_id: org.orgId,
      agent_id: id,
      created_by: user.id,
      ...parsed.data,
    })
    .select("id, rotulo, ad_id, titulo_contem, nivel, desejo_ou_dor, medo_oculto, promessa, ativo, created_at, updated_at")
    .single();
  if (error) {
    // 23505 = colidiu com o índice único de ad_id ativo (outro brief já usa este anúncio neste agente).
    if (error.code === "23505") {
      return fail(
        "state_conflict",
        t("Já existe um brief ativo para este ID de anúncio neste agente. Desative o outro antes, ou edite-o."),
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao criar o brief de anúncio.", 500, { requestId });
  }

  await audit({
    action: "ai.ad_brief_created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    // Só o formato: nunca o texto que o dono digitou (desejo/medo/promessa) vai para a auditoria.
    metadata: { brief_id: data.id, nivel: data.nivel, tem_ad_id: data.ad_id !== null, tem_titulo: data.titulo_contem !== null },
  });

  return ok({ ad_brief: data }, { requestId });
}
