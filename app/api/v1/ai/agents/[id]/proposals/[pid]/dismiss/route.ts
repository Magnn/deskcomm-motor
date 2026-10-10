import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST: DISPENSA uma proposta pendente. Ela sai da lista e deixa de ser aplicável; a linha fica
 * (com quem dispensou e quando), porque proposta dispensada também é histórico do que o agente
 * tentou aprender.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { dismissProposal } from "@/lib/ai/apply-proposal";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HTTP_BY_CODE = {
  proposal_not_found: 404,
  proposal_already_applied: 409,
  internal_error: 500,
} as const;

type Ctx = { params: Promise<{ id: string; pid: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id, pid } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(pid)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const authz = await requireRole("admin", { requestId, resource: "flywheel_proposals" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org } = authz;

  const admin = createAdminClient();
  const result = await dismissProposal(admin, { orgId: org.orgId, proposalId: pid, userId: authUser.id });
  if (!result.ok) {
    return fail(result.code, result.message, HTTP_BY_CODE[result.code], { requestId });
  }

  await audit({
    action: "ai.flywheel_proposal_dismissed",
    actorUserId: authUser.id,
    organizationId: org.orgId,
    resourceType: "flywheel_distiller_proposals",
    resourceId: pid,
    metadata: { agent_id: id },
  });

  return ok({ dismissed: true }, { requestId });
}
