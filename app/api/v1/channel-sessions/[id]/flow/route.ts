import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  channelFlowConfigSchema,
  estamparConfigDeFluxoNoMetadata,
  lerConfigDeFluxoDoCanal,
} from "@/lib/channels/channel-flow-config";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "channel_sessions", allowPlatformAdmin: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "Canal inválido.", 422, { requestId });
  }

  const { data, error } = await createAdminClient()
    .from("channel_sessions")
    .select("metadata")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) return fail("internal_error", "Não foi possível carregar a configuração do canal.", 500, { requestId });
  if (!data) return fail("not_found", "Canal não encontrado.", 404, { requestId });

  return ok(lerConfigDeFluxoDoCanal(data.metadata), { requestId });
}

export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "Canal inválido.", 422, { requestId });
  }

  const body = await req.json().catch(() => null);
  const parsed = channelFlowConfigSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Configuração de fluxo ou modo inválida.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { data: current, error: loadErr } = await admin
    .from("channel_sessions")
    .select("metadata")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (loadErr) return fail("internal_error", "Erro ao carregar canal.", 500, { requestId });
  if (!current) return fail("not_found", "Canal não encontrado.", 404, { requestId });

  const updatedMetadata = estamparConfigDeFluxoNoMetadata(current.metadata, parsed.data);

  const { error: updateErr } = await admin
    .from("channel_sessions")
    .update({ metadata: updatedMetadata })
    .eq("organization_id", auth.org.orgId)
    .eq("id", id);

  if (updateErr) return fail("internal_error", "Não foi possível salvar configuração de fluxo.", 500, { requestId });

  void audit({
    action: "channel.ai_access_updated",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    metadata: parsed.data,
  });

  return ok(lerConfigDeFluxoDoCanal(updatedMetadata), { requestId });
}
