import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST: DESFAZ uma proposta aplicada — o agente volta ao que era antes dela, por uma versão NOVA
 * (o histórico não é reescrito). A regra de como voltar está em `revertProposal`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { revertProposal, type RevertProposalErrorCode } from "@/lib/ai/apply-proposal";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HTTP_BY_CODE: Record<RevertProposalErrorCode, number> = {
  proposal_not_found: 404,
  proposal_not_applied: 409,
  proposal_already_reverted: 409,
  proposal_type_unsupported: 422,
  agent_not_published: 422,
  revert_needs_manual_edit: 409,
  publish_failed: 422,
  internal_error: 500,
};

type Ctx = { params: Promise<{ id: string; pid: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id, pid } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(pid)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  // Desfazer publica versão: mesmo papel de quem aplica.
  const authz = await requireRole("admin", { requestId, resource: "flywheel_proposals" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org } = authz;

  const admin = createAdminClient();
  const result = await revertProposal(admin, {
    orgId: org.orgId,
    agentId: id,
    proposalId: pid,
    userId: authUser.id,
  });
  if (!result.ok) {
    return fail(result.code, result.message, HTTP_BY_CODE[result.code], { requestId });
  }

  await audit({
    action: "ai.flywheel_proposal_reverted",
    actorUserId: authUser.id,
    organizationId: org.orgId,
    resourceType: "flywheel_distiller_proposals",
    resourceId: pid,
    metadata:
      "entryId" in result
        ? { agent_id: id, entry_id: result.entryId, modo: result.modo }
        : { agent_id: id, version_id: result.versionId, version_number: result.versionNumber, modo: result.modo },
  });

  return ok(
    "entryId" in result
      ? { entry_id: result.entryId, modo: result.modo }
      : { version_id: result.versionId, version_number: result.versionNumber, modo: result.modo },
    { requestId },
  );
}
