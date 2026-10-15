/**
 * PATCH  /api/v1/area/servicos/:id (manager+) — altera um serviço da vitrine.
 * DELETE /api/v1/area/servicos/:id (manager+) — tira da vitrine.
 *
 * Apagar não perde histórico: os eventos do painel guardam o serviço com
 * `on delete set null`, e as compras moram no ledger. Para só esconder sem
 * perder o nome no painel, desligue (`ativo: false`).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { COLUNAS_DO_SERVICO, servicoDaAreaParcialSchema } from "@/lib/area-do-cliente/servicos";
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

  const lido = servicoDaAreaParcialSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", lido.error.issues[0]?.message ?? "Serviço inválido.", 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_servicos")
    .update({ ...lido.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DO_SERVICO)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Serviço não encontrado.", 404, { requestId });

  await audit({
    action: "area.servico_alterado",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_servico",
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
    .from("area_servicos")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id");
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data || data.length === 0) return fail("not_found", "Serviço não encontrado.", 404, { requestId });

  await audit({
    action: "area.servico_removido",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_servico",
    resourceId: id,
    requestId,
  });
  return ok({ removido: true }, { requestId });
}
