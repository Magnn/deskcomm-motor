/**
 * PATCH  /api/v1/area/simpatias/:id (manager+) — altera uma simpatia.
 * DELETE /api/v1/area/simpatias/:id (manager+) — tira do catálogo.
 *
 * Apagar não perde histórico: o pedido guarda o título e aponta para a simpatia com `on delete set null`. Para só
 * esconder, desligue (`publicada: false`).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { COLUNAS_DA_SIMPATIA, simpatiaParcialSchema } from "@/lib/area-do-cliente/simpatias";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await params;
  if (!UUID.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const lido = simpatiaParcialSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", lido.error.issues[0]?.message ?? "Simpatia inválida.", 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_simpatias")
    .update({ ...lido.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DA_SIMPATIA)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Simpatia não encontrada.", 404, { requestId });

  await audit({
    action: "area.simpatia_alterada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_simpatia",
    resourceId: id,
    requestId,
    metadata: { campos: Object.keys(lido.data) },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await params;
  if (!UUID.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_simpatias")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id");
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data || data.length === 0) return fail("not_found", "Simpatia não encontrada.", 404, { requestId });

  await audit({
    action: "area.simpatia_removida",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_simpatia",
    resourceId: id,
    requestId,
  });
  return ok({ removida: true }, { requestId });
}
